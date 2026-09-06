from sqlalchemy.orm import Session
from .model import Sale, SaleItem
from inventory.model import Product
from .schema import SaleCreate
from datetime import date, datetime, time, timedelta
from sqlalchemy.exc import IntegrityError  # ← ADD this import at the top
from sqlalchemy import func
def get_pos_products(db: Session, company_id: int | None = None, search: str = None):
    query = db.query(Product).filter(Product.is_active == True, Product.counter_stock > 0)
    if company_id is not None:
        query = query.filter(Product.company_id == company_id)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Product.name.ilike(search_term)) |
            (Product.barcode.ilike(search_term))
        )
    return query.all()

def create_sale(db: Session, sale_data: SaleCreate):
    sale_dict = sale_data.model_dump(exclude={"items"})
    company_id = sale_dict.get("company_id")
    
    # ─── Try up to 5 times to avoid duplicate invoice_number ───
    db_sale = None
    for attempt in range(5):
        try:
            db_sale = Sale(**sale_dict)
            db.add(db_sale)
            db.flush()  # This triggers the unique constraint check
            break  # Success — exit the loop

        except IntegrityError:
            db.rollback()
            # Generate a guaranteed-unique invoice number using timestamp + attempt
            sale_dict['invoice_number'] = f"INV-{datetime.now().strftime('%y%m%d%H%M%S')}-{attempt + 1}"
            continue

    if db_sale is None:
        raise ValueError("Could not generate a unique invoice number. Please try again.")

    # ─── Process items (unchanged from your original) ───
    for item_data in sale_data.items:
        item_dict = item_data.model_dump()
        item_dict["company_id"] = db_sale.company_id
        db_item = SaleItem(**item_dict, sale_id=db_sale.id)
        db.add(db_item)

        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if product:
            if (product.counter_stock or 0) < item_data.quantity:
                raise ValueError(f"Not enough counter stock for {product.name}")
            product.counter_stock -= item_data.quantity
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
            db.add(product)

    db.commit()
    db.refresh(db_sale)
    return db_sale

def get_sales_report_service(
    db: Session,
    company_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    query = db.query(Sale)

    if company_id is not None:
        query = query.filter(Sale.company_id == company_id)

    if date_from is not None:
        start_datetime = datetime.combine(date_from, time.min)
        query = query.filter(Sale.created_at >= start_datetime)

    if date_to is not None:
        end_datetime = datetime.combine(
            date_to + timedelta(days=1),
            time.min,
        )
        query = query.filter(Sale.created_at < end_datetime)

    return query.order_by(Sale.created_at.desc()).all()

def get_sale_by_id(db: Session, sale_id: int):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise ValueError(f"Sale with ID {sale_id} not found")
    return sale

def update_sale(db: Session, sale_id: int, sale_data: SaleCreate):
    db_sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not db_sale:
        raise ValueError(f"Sale with ID {sale_id} not found")

    old_items = db.query(SaleItem).filter(SaleItem.sale_id == sale_id).all()
    for old_item in old_items:
        product = db.query(Product).filter(Product.id == old_item.product_id).first()
        if product:
            product.counter_stock += old_item.quantity
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
            db.add(product)

    db.query(SaleItem).filter(SaleItem.sale_id == sale_id).delete()

    db_sale.customer_name = sale_data.customer_name
    db_sale.customer_phone = sale_data.customer_phone
    db_sale.payment_mode = sale_data.payment_mode
    db_sale.total_amount = sale_data.total_amount

    if sale_data.created_at:
        db_sale.created_at = sale_data.created_at

    for item_data in sale_data.items:
        item_dict = item_data.model_dump()
        item_dict["company_id"] = db_sale.company_id
        db_item = SaleItem(**item_dict, sale_id=db_sale.id)
        db.add(db_item)

        product = db.query(Product).filter(Product.id == item_data.product_id).first()
        if not product:
            raise ValueError(f"Product ID {item_data.product_id} not found")
        if (product.counter_stock or 0) < item_data.quantity:
            raise ValueError(f"Not enough counter stock for {product.name}. Available: {product.counter_stock}, Requested: {item_data.quantity}")
        product.counter_stock -= item_data.quantity
        product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
        db.add(product)

    db.commit()
    db.refresh(db_sale)
    return db_sale

# ═══════════════════════════════════════════════════════════════
# NEW: Update product MRP from POS counter
# ═══════════════════════════════════════════════════════════════
def update_product_mrp(db: Session, product_id: int, company_id: int, new_mrp: float):
    product = db.query(Product).filter(
        Product.id == product_id,
        Product.company_id == company_id
    ).first()
    if not product:
        raise ValueError(f"Product with ID {product_id} not found in this company")

    old_mrp = product.mrp
    product.mrp = new_mrp
    product.sale_price = new_mrp
    db.commit()
    db.refresh(product)

    return {
        "id": product.id,
        "name": product.name,
        "old_mrp": old_mrp,
        "new_mrp": new_mrp,
        "sale_price": product.sale_price,
    }
