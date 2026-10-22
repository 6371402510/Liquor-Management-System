from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from datetime import date as date_type

from .model import Purchase, PurchaseItem
from .schema import PurchaseCreate
from inventory.model import Product


# ─────────────────────────────────────────────────────────────
# READS
# ─────────────────────────────────────────────────────────────

def get_purchases(db: Session, company_id: int | None = None,
                  skip: int = 0, limit: int = 1000):
    query = db.query(Purchase)
    if company_id is not None:
        query = query.filter(Purchase.company_id == company_id)
    return (
        query.order_by(Purchase.purchase_date.desc())
        .offset(skip).limit(limit).all()
    )


def get_purchase(db: Session, purchase_id: int):
    return db.query(Purchase).filter(Purchase.id == purchase_id).first()


def get_purchase_items(db: Session, purchase_id: int):
    """
    Return PurchaseItem rows enriched with `short_name`.
    Resolution order:
      1. persisted PurchaseItem.short_name
      2. Product.short_name for the linked product_id (same company)
      3. Product.name fallback
      4. None
    """
    items = (
        db.query(PurchaseItem)
        .filter(PurchaseItem.purchase_id == purchase_id)
        .all()
    )
    if not items:
        return []

    product_ids = list({i.product_id for i in items if i.product_id})
    products = {}
    if product_ids:
        rows = db.query(Product).filter(Product.id.in_(product_ids)).all()
        products = {p.id: p for p in rows}

    for it in items:
        persisted = getattr(it, "short_name", None)
        prod = products.get(it.product_id) if it.product_id else None
        resolved = (
            persisted
            or (prod.short_name if prod else None)
            or (prod.name if prod else None)
        )
        it.short_name = resolved

    return items


# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────

def _get_product_for_company(db: Session, product_id: int, company_id: int):
    """Always scope product lookup by company."""
    if not product_id:
        return None
    return (
        db.query(Product)
        .filter(Product.id == product_id,
                Product.company_id == company_id)
        .first()
    )


def _apply_stock(product, total_bottles, destination, is_add=True):
    """Add or remove stock from counter or godown based on destination."""
    if not product:
        return

    if destination == "COUNTER":
        if is_add:
            product.counter_stock = (product.counter_stock or 0) + total_bottles
        else:
            product.counter_stock = max(0, (product.counter_stock or 0) - total_bottles)
    else:  # GODOWN (default)
        if is_add:
            product.godown_stock = (product.godown_stock or 0) + total_bottles
        else:
            product.godown_stock = max(0, (product.godown_stock or 0) - total_bottles)

    product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)


def _update_product_rate(product, item_data, total_bottles, purchase_data=None):
    rate_per_unit = 0.0

    if item_data.purchase_rate_per_unit and item_data.purchase_rate_per_unit > 0:
        rate_per_unit = item_data.purchase_rate_per_unit
    elif item_data.unit_cost and item_data.unit_cost > 0:
        bpc = product.bottles_per_case or item_data.bottles_per_case or 0
        if bpc > 0:
            rate_per_unit = item_data.unit_cost / bpc
    elif total_bottles > 0 and item_data.total_cost and item_data.total_cost > 0:
        rate_per_unit = item_data.total_cost / total_bottles

    if rate_per_unit > 0:
        product.purchase_rate = rate_per_unit

        # Landing cost formula
        base = rate_per_unit + (rate_per_unit * 0.35)
        base_with_tcs = base + (base * 0.02)

        if purchase_data:
            handling   = purchase_data.total_handling or 0
            vat_amount = purchase_data.vat_amount or 0
            tcs_amount = purchase_data.tcs_amount or 0
            subtotal   = purchase_data.subtotal or 0

            denominator = vat_amount + tcs_amount + subtotal

            if denominator > 0:
                landing_cost = base_with_tcs + (base_with_tcs * (handling / denominator))
                product.landing_cost = round(landing_cost, 2)
            else:
                product.landing_cost = round(base_with_tcs, 2)
        else:
            product.landing_cost = round(base_with_tcs, 2)


def _calc_total_bottles(item):
    total_bottles = item.total_bottles or 0
    if total_bottles == 0 and item.qty_cases > 0:
        total_bottles = item.qty_cases * (item.bottles_per_case or 1)
    return total_bottles


def _resolve_total_bottles(item_dict: dict) -> int:
    """
    Compute a trustworthy `total_bottles` from whichever fields are present.
    Order of preference:
      1. explicit total_bottles
      2. qty_cases * bottles_per_case
      3. qty_bottles (direct bottles entry)
    """
    qty_cases        = item_dict.get("qty_cases") or 0
    bottles_per_case = item_dict.get("bottles_per_case") or 0
    qty_bottles      = item_dict.get("qty_bottles") or 0
    tb               = item_dict.get("total_bottles") or 0

    if tb > 0:
        return int(tb)
    if qty_cases > 0 and bottles_per_case > 0:
        return int(qty_cases * bottles_per_case)
    if qty_bottles > 0:
        return int(qty_bottles)
    return 0


# ─────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────

def create_purchase(db: Session, purchase_data: PurchaseCreate):
    if check_invoice_number_exists(
        db, purchase_data.invoice_number,
        company_id=purchase_data.company_id
    ):
        raise ValueError(
            f"Invoice number '{purchase_data.invoice_number}' already exists "
            f"for this company"
        )

    purchase_dict = purchase_data.model_dump(exclude={"items"}, by_alias=False)

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = (
            purchase_dict.get("billing_date") or date_type.today()
        )
    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

    destination = purchase_dict.get("stock_destination", "GODOWN")
    company_id  = purchase_dict.get("company_id")

    if not company_id:
        raise ValueError("company_id is required to create a purchase")

    db_purchase = Purchase(**purchase_dict)

    try:
        db.add(db_purchase)
        db.flush()

        for item_data in purchase_data.items:
            item_dict = item_data.model_dump(by_alias=False)
            item_dict["purchase_id"] = db_purchase.id
            item_dict["company_id"]  = company_id

            # ✅ Always persist a trustworthy total_bottles
            item_dict["total_bottles"] = _resolve_total_bottles(item_dict)

            db_item = PurchaseItem(**item_dict)
            db.add(db_item)

            # ─── STOCK UPDATE (company-scoped) ───
            product = _get_product_for_company(
                db, item_data.product_id, company_id
            )
            if product:
                total_bottles = item_dict["total_bottles"]  # use resolved value
                _apply_stock(product, total_bottles, destination, is_add=True)

                if (product.opening_stock or 0) == 0:
                    product.opening_stock = total_bottles

                _update_product_rate(product, item_data, total_bottles, db_purchase)

        db.commit()
        db.refresh(db_purchase)
        return db_purchase

    except IntegrityError:
        db.rollback()
        return None
    except Exception as e:
        db.rollback()
        raise e


# ─────────────────────────────────────────────────────────────
# UPDATE
# ─────────────────────────────────────────────────────────────

def update_purchase(db: Session, purchase_id: int, purchase_data: PurchaseCreate):
    db_purchase = get_purchase(db, purchase_id)
    if not db_purchase:
        return None

    # Duplicate invoice check (scoped to same company)
    if check_invoice_number_exists(
        db, purchase_data.invoice_number,
        exclude_purchase_id=purchase_id,
        company_id=purchase_data.company_id
    ):
        raise ValueError(
            f"Invoice number '{purchase_data.invoice_number}' already exists "
            f"for this company"
        )

    old_destination = db_purchase.stock_destination or "GODOWN"
    old_company_id  = db_purchase.company_id

    # ─── STEP 1: REVERSE OLD STOCK FROM OLD COMPANY / OLD LOCATION ───
    old_items = (
        db.query(PurchaseItem)
        .filter(PurchaseItem.purchase_id == purchase_id)
        .all()
    )
    for old_item in old_items:
        product = _get_product_for_company(
            db, old_item.product_id, old_company_id
        )
        if product:
            total_bottles = _calc_total_bottles(old_item)
            _apply_stock(product, total_bottles, old_destination, is_add=False)

    # ─── STEP 2: DELETE OLD ITEMS ───
    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()

    # ─── STEP 3: UPDATE HEADER ───
    purchase_dict = purchase_data.model_dump(exclude={"items"}, by_alias=False)

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = (
            purchase_dict.get("billing_date") or date_type.today()
        )
    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

    new_destination = purchase_dict.get("stock_destination", "GODOWN")
    new_company_id  = purchase_dict.get("company_id")

    if not new_company_id:
        raise ValueError("company_id is required to update a purchase")

    for key, value in purchase_dict.items():
        setattr(db_purchase, key, value)

    db.flush()

    # ─── STEP 4: CREATE NEW ITEMS + APPLY STOCK TO NEW COMPANY / LOCATION ───
    for item_data in purchase_data.items:
        item_dict = item_data.model_dump(by_alias=False)
        item_dict["purchase_id"] = db_purchase.id
        item_dict["company_id"]  = new_company_id

        # ✅ Always persist a trustworthy total_bottles
        item_dict["total_bottles"] = _resolve_total_bottles(item_dict)

        db_item = PurchaseItem(**item_dict)
        db.add(db_item)

        product = _get_product_for_company(
            db, item_data.product_id, new_company_id
        )
        if product:
            total_bottles = item_dict["total_bottles"]  # use resolved value
            _apply_stock(product, total_bottles, new_destination, is_add=True)
            _update_product_rate(product, item_data, total_bottles, db_purchase)

    try:
        db.commit()
        db.refresh(db_purchase)
        return db_purchase
    except Exception as e:
        db.rollback()
        raise e


# ─────────────────────────────────────────────────────────────
# DELETE
# ─────────────────────────────────────────────────────────────

def delete_purchase(db: Session, purchase_id: int):
    db_purchase = get_purchase(db, purchase_id)
    if not db_purchase:
        return False

    old_destination = db_purchase.stock_destination or "GODOWN"
    old_company_id  = db_purchase.company_id

    items = (
        db.query(PurchaseItem)
        .filter(PurchaseItem.purchase_id == purchase_id)
        .all()
    )
    for item in items:
        product = _get_product_for_company(
            db, item.product_id, old_company_id
        )
        if product:
            total_bottles = _calc_total_bottles(item)
            _apply_stock(product, total_bottles, old_destination, is_add=False)

    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()
    db.delete(db_purchase)
    db.commit()
    return True


# ─────────────────────────────────────────────────────────────
# INVOICE UNIQUENESS (scoped to company)
# ─────────────────────────────────────────────────────────────

def check_invoice_number_exists(
    db: Session,
    invoice_number: str,
    exclude_purchase_id: int = None,
    company_id: int = None,
):
    """
    Check if an invoice number already exists.
    Invoice numbers are unique *per company*, not globally.
    """
    query = db.query(Purchase).filter(Purchase.invoice_number == invoice_number)

    if company_id is not None:
        query = query.filter(Purchase.company_id == company_id)

    if exclude_purchase_id is not None:
        query = query.filter(Purchase.id != exclude_purchase_id)

    return query.first() is not None