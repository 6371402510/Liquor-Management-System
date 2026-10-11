from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from datetime import datetime

from .model import CompanyStockTransfer, CompanyStockTransferItem
from .schema import CompanyTransferCreate
from inventory.model import Product
from company.model import Company   # adjust import if path differs


# ─────────────────────────────────────────────
# GENERATE TRANSFER NUMBER
# ─────────────────────────────────────────────
def _generate_transfer_number(db: Session) -> str:
    today = datetime.now().strftime("%Y%m%d")
    prefix = f"CST-{today}-"

    last = (
        db.query(CompanyStockTransfer)
        .filter(CompanyStockTransfer.transfer_number.like(f"{prefix}%"))
        .order_by(CompanyStockTransfer.id.desc())
        .first()
    )

    if last:
        try:
            seq = int(last.transfer_number.split("-")[-1]) + 1
        except (ValueError, IndexError):
            seq = 1
    else:
        seq = 1

    return f"{prefix}{seq:04d}"


# ─────────────────────────────────────────────
# FIND OR CREATE DESTINATION PRODUCT
# ─────────────────────────────────────────────
def _find_or_create_destination_product(
    db: Session, source_product: Product, to_company_id: int
) -> Product:
    """Match destination product by item_code. Create if missing."""
    existing = (
        db.query(Product)
        .filter(
            Product.company_id == to_company_id,
            Product.item_code == source_product.item_code,
            Product.is_active == True,
        )
        .first()
    )
    if existing:
        return existing

    # Clone product into destination company (stock = 0)
    new_product = Product(
        company_id=to_company_id,
        item_code=source_product.item_code,
        barcode=source_product.barcode,
        sort_key=source_product.sort_key,
        name=source_product.name,
        short_name=source_product.short_name,
        brand=source_product.brand,
        category=source_product.category,
        sub_category=source_product.sub_category,
        product_type=source_product.product_type,
        bottle_size=source_product.bottle_size,
        traditional_name=source_product.traditional_name,
        bottles_per_case=source_product.bottles_per_case,
        unit=source_product.unit,
        packing_type=source_product.packing_type,
        purchase_rate=source_product.purchase_rate,
        landing_cost=source_product.landing_cost,
        mrp=source_product.mrp,
        sale_price=source_product.sale_price,
        discount_allowed=source_product.discount_allowed,
        discount_percent=source_product.discount_percent,
        vat_rate=source_product.vat_rate,
        margin_percent=source_product.margin_percent,
        hsn_code=source_product.hsn_code,
        godown_stock=0,
        counter_stock=0,
        current_stock=0,
        opening_stock=0,
        reorder_level=source_product.reorder_level,
        maximum_stock=source_product.maximum_stock,
        status="ACTIVE",
        is_active=True,
    )
    db.add(new_product)
    db.flush()
    return new_product


# ─────────────────────────────────────────────
# GET TRANSFERS (used by router)
# ─────────────────────────────────────────────
def get_company_transfers(
    db: Session,
    company_id: int | None = None,
    skip: int = 0,
    limit: int = 500,
):
    """Returns transfers where company is either source OR destination."""
    q = db.query(CompanyStockTransfer)

    if company_id is not None:
        q = q.filter(
            or_(
                CompanyStockTransfer.from_company_id == company_id,
                CompanyStockTransfer.to_company_id == company_id,
            )
        )

    return (
        q.order_by(CompanyStockTransfer.transfer_date.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_company_transfer(db: Session, transfer_id: int):
    return (
        db.query(CompanyStockTransfer)
        .filter(CompanyStockTransfer.id == transfer_id)
        .first()
    )


def get_company_transfer_items(db: Session, transfer_id: int):
    return (
        db.query(CompanyStockTransferItem)
        .filter(CompanyStockTransferItem.transfer_id == transfer_id)
        .all()
    )


# ─────────────────────────────────────────────
# CREATE TRANSFER (main logic)
# ─────────────────────────────────────────────
def create_company_transfer(db: Session, data: CompanyTransferCreate):
    # ─── 1. Validate companies ───
    if data.from_company_id == data.to_company_id:
        raise ValueError("Source and destination companies must be different.")

    from_company = db.query(Company).filter(Company.id == data.from_company_id).first()
    to_company = db.query(Company).filter(Company.id == data.to_company_id).first()

    if not from_company:
        raise ValueError("Source company not found.")
    if not to_company:
        raise ValueError("Destination company not found.")

    # ─── 2. Create transfer header ───
    transfer = CompanyStockTransfer(
        transfer_number=_generate_transfer_number(db),
        from_company_id=data.from_company_id,
        from_company_name=from_company.company_name,
        to_company_id=data.to_company_id,
        to_company_name=to_company.company_name,
        notes=data.notes,
        vehicle_number=data.vehicle_number,
        status="COMPLETED",
        total_bottles=0,
        total_items=0,
    )
    db.add(transfer)
    db.flush()

    total_bottles = 0
    total_items = 0

    try:
        for item in data.items:
            qty = int(item.quantity or 0)
            if qty <= 0:
                continue

            # ─── 3. Lock source product ───
            src = (
                db.query(Product)
                .filter(
                    Product.id == item.product_id,
                    Product.company_id == data.from_company_id,
                    Product.is_active == True,
                )
                .with_for_update()
                .first()
            )
            if not src:
                raise ValueError(f"Source product ID {item.product_id} not found.")

            available = src.godown_stock or 0
            if qty > available:
                raise ValueError(
                    f"'{src.name}': only {available} bottles in source godown, "
                    f"cannot transfer {qty}."
                )

            # ─── 4. Deduct from source ───
            src.godown_stock = available - qty
            src.current_stock = (src.godown_stock or 0) + (src.counter_stock or 0)

            # ─── 5. Find/create destination product ───
            dst = _find_or_create_destination_product(db, src, data.to_company_id)

            # ─── 6. Add to destination ───
            dst.godown_stock = (dst.godown_stock or 0) + qty
            dst.current_stock = (dst.godown_stock or 0) + (dst.counter_stock or 0)
            if (dst.opening_stock or 0) == 0:
                dst.opening_stock = qty

            # ─── 7. Record line item ───
            db_item = CompanyStockTransferItem(
                transfer_id=transfer.id,
                from_product_id=src.id,
                to_product_id=dst.id,
                product_name=src.name,
                item_code=src.item_code,
                barcode=src.barcode,
                bottle_size=src.bottle_size,
                bottles_per_case=src.bottles_per_case or 0,
                cases=item.cases or 0,
                quantity=qty,
                from_company_id=data.from_company_id,
                to_company_id=data.to_company_id,
            )
            db.add(db_item)

            total_bottles += qty
            total_items += 1

        if total_items == 0:
            raise ValueError("No valid items to transfer.")

        transfer.total_bottles = total_bottles
        transfer.total_items = total_items

        db.commit()
        db.refresh(transfer)
        return transfer

    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database error: {str(e.orig)}")
    except Exception as e:
        db.rollback()
        raise e



def _generate_invoice_number(db: Session, transfer: CompanyStockTransfer) -> str:
    """Generate invoice number based on transfer."""
    # Format: INV-CST-YYYYMMDD-XXXX
    date_part = transfer.transfer_date.strftime("%Y%m%d") if transfer.transfer_date else datetime.now().strftime("%Y%m%d")
    seq = str(transfer.id).zfill(4)
    return f"INV-{transfer.transfer_number}"


# ─────────────────────────────────────────────
# BUILD INVOICE FROM TRANSFER
# ─────────────────────────────────────────────
def build_transfer_invoice(db: Session, transfer_id: int) -> dict:
    """Build a complete invoice payload from a transfer."""
    transfer = get_company_transfer(db, transfer_id)
    if not transfer:
        raise ValueError("Transfer not found")

    items = get_company_transfer_items(db, transfer_id)

    # Fetch company details (for address / GST / phone)
    from_company = db.query(Company).filter(Company.id == transfer.from_company_id).first()
    to_company = db.query(Company).filter(Company.id == transfer.to_company_id).first()

    invoice_items = []
    subtotal = 0.0
    total_cases = 0
    total_units = 0

    for it in items:
        # Fetch source product to get rate (purchase_rate or landing_cost or mrp)
        product = db.query(Product).filter(Product.id == it.from_product_id).first()

        bpc = it.bottles_per_case or (product.bottles_per_case if product else 0) or 1
        cases = it.cases or 0

        # If cases not provided, derive from quantity
        if cases == 0 and it.quantity > 0 and bpc > 0:
            cases = it.quantity // bpc

        units = it.quantity or 0

        # Rate per case: use product purchase_rate * bottles_per_case
        # Fallback chain: landing_cost -> purchase_rate -> sale_price -> mrp -> 0
        rate_per_bottle = 0.0
        if product:
            rate_per_bottle = (
                product.landing_cost
                or product.purchase_rate
                or product.sale_price
                or product.mrp
                or 0.0
            )

        rate_per_case = round(rate_per_bottle * bpc, 2)

        # Amount = cases * rate_per_case (or units * rate_per_bottle)
        if cases > 0:
            amount = round(cases * rate_per_case, 2)
        else:
            amount = round(units * rate_per_bottle, 2)

        subtotal += amount
        total_cases += cases
        total_units += units

        invoice_items.append({
            "product_name": it.product_name,
            "bottle_size": it.bottle_size,
            "rate_per_case": rate_per_case,
            "quantity_cases": cases,
            "quantity_units": units,
            "total_amount": amount,
        })

    return {
        "invoice_number": _generate_invoice_number(db, transfer),
        "transfer_number": transfer.transfer_number,
        "transfer_date": transfer.transfer_date,

        "from_company_id": transfer.from_company_id,
        "from_company_name": transfer.from_company_name,
        "from_company_address": getattr(from_company, "address", None) if from_company else None,
        "from_company_gst": getattr(from_company, "gst_number", None) if from_company else None,
        "from_company_phone": getattr(from_company, "phone", None) if from_company else None,

        "to_company_id": transfer.to_company_id,
        "to_company_name": transfer.to_company_name,
        "to_company_address": getattr(to_company, "address", None) if to_company else None,
        "to_company_gst": getattr(to_company, "gst_number", None) if to_company else None,
        "to_company_phone": getattr(to_company, "phone", None) if to_company else None,

        "vehicle_number": transfer.vehicle_number,
        "notes": transfer.notes,

        "items": invoice_items,
        "subtotal": round(subtotal, 2),
        "total_cases": total_cases,
        "total_units": total_units,
        "grand_total": round(subtotal, 2),
    }