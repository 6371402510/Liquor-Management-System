from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from inventory.model import Product
from inventory.schema import ProductCreate, ProductUpdate


def get_products(db: Session, skip: int = 0, limit: int = 1000):
    return db.query(Product).filter(Product.is_active == True).order_by(Product.name).offset(skip).limit(limit).all()


def get_product(db: Session, product_id: int):
    return db.query(Product).filter(Product.id == product_id).first()


def _check_duplicates(db: Session, company_id, item_code, barcode, exclude_id=None):
    """Helper to safely check duplicates, ignoring NULL values"""
    if not company_id:
        return

    filters = [Product.company_id == company_id]
    if exclude_id:
        filters.append(Product.id != exclude_id)

    conditions = []
    if item_code:
        conditions.append(Product.item_code == item_code)
    if barcode:
        conditions.append(Product.barcode == barcode)

    if not conditions:
        return

    existing = db.query(Product).filter(*filters).filter(or_(*conditions)).first()

    if existing:
        if item_code and existing.item_code == item_code:
            raise ValueError(f"Item Code '{item_code}' already exists for this company.")
        if barcode and existing.barcode == barcode:
            raise ValueError(f"Barcode '{barcode}' already exists for this company.")


def create_product(db: Session, product_data: ProductCreate):
    product_dict = product_data.model_dump(by_alias=False)

    company_id = product_dict.get('company_id')
    item_code = product_dict.get('item_code')
    barcode = product_dict.get('barcode')

    _check_duplicates(db, company_id, item_code, barcode)

    db_product = Product(**product_dict)

    try:
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        return db_product
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database constraint failed: {e.orig}")


def update_product(db: Session, product_id: int, product_data: ProductUpdate):
    db_product = get_product(db, product_id)
    if not db_product:
        return None

    update_data = product_data.model_dump(exclude_unset=True, by_alias=False)

    # Use new values if provided, otherwise fall back to existing
    company_id = update_data.get('company_id', db_product.company_id)
    item_code = update_data.get('item_code', db_product.item_code)
    barcode = update_data.get('barcode', db_product.barcode)

    _check_duplicates(db, company_id, item_code, barcode, exclude_id=product_id)

    for key, value in update_data.items():
        setattr(db_product, key, value)

    try:
        db.commit()
        db.refresh(db_product)
        return db_product
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database constraint failed: {e.orig}")


def soft_delete_product(db: Session, product_id: int):
    db_product = get_product(db, product_id)
    if not db_product:
        return False

    db_product.is_active = False
    db_product.status = "INACTIVE"
    db.commit()
    return True