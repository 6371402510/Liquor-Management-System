from sqlalchemy.orm import Session
from fastapi import HTTPException
from inventory.model import Product
from .model import GodownSale, GodownSaleItem
from .schema import GodownCheckoutRequest
from sqlalchemy import or_

def get_godown_products(db: Session, company_id: int | None = None, search: str = ""):
    query = db.query(Product).filter(Product.is_active == True)
    if company_id is not None:
        query = query.filter(Product.company_id == company_id)
    if search:
        search_term = f"%{search.lower()}%"
        query = query.filter(
            or_(
                Product.name.ilike(search_term),
                Product.barcode.ilike(search_term),
                Product.brand.ilike(search_term),
                Product.item_code.ilike(search_term),
                Product.traditional_name.ilike(search_term)
            )
        )
    return query.order_by(Product.name).all()

def process_godown_checkout(db: Session, checkout_data: GodownCheckoutRequest):
    for item in checkout_data.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise HTTPException(status_code=404, detail=f"Product ID {item.product_id} not found.")
        if product.godown_stock < item.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient godown stock for {product.name}. Available: {product.godown_stock}, Requested: {item.quantity}"
            )

    db_sale = GodownSale(
        company_id=checkout_data.company_id,
        invoice_number=checkout_data.invoice_number,
        customer_name=checkout_data.customer_name,
        customer_phone=checkout_data.customer_phone,
        total_amount=checkout_data.total_amount,
        payment_mode=checkout_data.payment_mode
    )
    db.add(db_sale)
    db.flush()

    for item in checkout_data.items:
        db_item = GodownSaleItem(
            sale_id=db_sale.id,
            company_id=checkout_data.company_id,
            product_id=item.product_id,
            product_name=item.product_name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount=item.discount,
            total_price=item.total_price
        )
        db.add(db_item)

        product = db.query(Product).filter(Product.id == item.product_id).first()
        product.godown_stock -= item.quantity
        product.current_stock -= item.quantity

    db.commit()
    db.refresh(db_sale)
    return db_sale

# ═══════════════════════════════════════════════════════════════
# NEW: Get godown sale by ID
# ═══════════════════════════════════════════════════════════════
def get_godown_sale_by_id(db: Session, sale_id: int):
    sale = db.query(GodownSale).filter(GodownSale.id == sale_id).first()
    if not sale:
        raise ValueError(f"Godown sale with ID {sale_id} not found")
    return sale

# ═══════════════════════════════════════════════════════════════
# NEW: Update an existing godown sale
# ═══════════════════════════════════════════════════════════════
def update_godown_sale(db: Session, sale_id: int, checkout_data: GodownCheckoutRequest):
    db_sale = db.query(GodownSale).filter(GodownSale.id == sale_id).first()
    if not db_sale:
        raise ValueError(f"Godown sale with ID {sale_id} not found")

    # 1. Restore old godown stock
    old_items = db.query(GodownSaleItem).filter(GodownSaleItem.sale_id == sale_id).all()
    for old_item in old_items:
        product = db.query(Product).filter(Product.id == old_item.product_id).first()
        if product:
            product.godown_stock += old_item.quantity
            product.current_stock += old_item.quantity
            db.add(product)

    # 2. Delete old items
    db.query(GodownSaleItem).filter(GodownSaleItem.sale_id == sale_id).delete()

    # 3. Validate new stock
    for item in checkout_data.items:
        product = db.query(Product).filter(Product.id == item.product_id).first()
        if not product:
            raise ValueError(f"Product ID {item.product_id} not found")
        if product.godown_stock < item.quantity:
            raise ValueError(
                f"Insufficient godown stock for {product.name}. Available: {product.godown_stock}, Requested: {item.quantity}"
            )

    # 4. Update sale header (keep original invoice_number)
    db_sale.customer_name = checkout_data.customer_name
    db_sale.customer_phone = checkout_data.customer_phone
    db_sale.total_amount = checkout_data.total_amount
    db_sale.payment_mode = checkout_data.payment_mode

    # 5. Add new items and deduct stock
    for item in checkout_data.items:
        db_item = GodownSaleItem(
            sale_id=db_sale.id,
            company_id=db_sale.company_id,
            product_id=item.product_id,
            product_name=item.product_name,
            quantity=item.quantity,
            unit_price=item.unit_price,
            discount=item.discount,
            total_price=item.total_price
        )
        db.add(db_item)

        product = db.query(Product).filter(Product.id == item.product_id).first()
        product.godown_stock -= item.quantity
        product.current_stock -= item.quantity

    db.commit()
    db.refresh(db_sale)
    return db_sale