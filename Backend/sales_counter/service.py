from sqlalchemy.orm import Session
from .model import Sale, SaleItem
from inventory.model import Product
from .schema import SaleCreate
from datetime import datetime, timedelta

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
    db_sale = Sale(**sale_dict)
    db.add(db_sale)
    db.flush()

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

def get_sales_report_service(db: Session, company_id: int | None = None, date_from: str = None, date_to: str = None):
    query = db.query(Sale)
    if company_id is not None:
        query = query.filter(Sale.company_id == company_id)
    if date_from:
        query = query.filter(Sale.created_at >= date_from)
    if date_to:
        end_date = (datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        query = query.filter(Sale.created_at < end_date)
    return query.order_by(Sale.created_at.desc()).all()

def get_sale_by_id(db: Session, sale_id: int):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise ValueError(f"Sale with ID {sale_id} not found")
    return sale

# ═══════════════════════════════════════════════════════════════
# NEW: Update an existing sale (restore old stock, apply new)
# ═══════════════════════════════════════════════════════════════
def update_sale(db: Session, sale_id: int, sale_data: SaleCreate):
    db_sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not db_sale:
        raise ValueError(f"Sale with ID {sale_id} not found")

    # 1. Restore old stock for each old item
    old_items = db.query(SaleItem).filter(SaleItem.sale_id == sale_id).all()
    for old_item in old_items:
        product = db.query(Product).filter(Product.id == old_item.product_id).first()
        if product:
            product.counter_stock += old_item.quantity
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
            db.add(product)

    # 2. Delete all old sale items
    db.query(SaleItem).filter(SaleItem.sale_id == sale_id).delete()

    # 3. Update sale header fields (keep original invoice_number)
    db_sale.customer_name = sale_data.customer_name
    db_sale.customer_phone = sale_data.customer_phone
    db_sale.payment_mode = sale_data.payment_mode
    db_sale.total_amount = sale_data.total_amount

    # 4. Add new items and deduct stock
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