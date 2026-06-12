from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from inventory.model import Product
from inventory.schema import ProductCreate, ProductUpdate


def get_products(db: Session, skip: int = 0, limit: int = 1000):
    return db.query(Product).filter(Product.is_active == True).order_by(Product.name).offset(skip).limit(limit).all()


def get_product(db: Session, product_id: int):
    return db.query(Product).filter(Product.id == product_id).first()


def create_product(db: Session, product_data: ProductCreate):
    product_dict = product_data.model_dump(by_alias=False)
    
    company_id = product_dict.get('company_id')
    item_code = product_dict.get('item_code')
    barcode = product_dict.get('barcode')

    # ─── CHECK FOR DUPLICATES PER COMPANY ───
    if company_id:
        existing = db.query(Product).filter(
            Product.company_id == company_id
        ).filter(
            (Product.item_code == item_code) | (Product.barcode == barcode)
        ).first()

        if existing:
            if existing.item_code == item_code:
                raise ValueError(f"Item Code '{item_code}' already exists for this company.")
            if existing.barcode == barcode:
                raise ValueError(f"Barcode '{barcode}' already exists for this company.")

    db_product = Product(**product_dict)
    
    try:
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        return db_product
    except IntegrityError as e:
        db.rollback()
        # EXPOSE THE REAL DATABASE ERROR SO WE CAN SEE WHICH CONSTRAINT FAILED
        raise ValueError(f"Database constraint failed: {e.orig}")


def update_product(db: Session, product_id: int, product_data: ProductUpdate):
    db_product = get_product(db, product_id)
    if not db_product:
        return None
    
    update_data = product_data.model_dump(exclude_unset=True, by_alias=False)
    
    # ─── CHECK FOR DUPLICATES PER COMPANY ON UPDATE ───
    company_id = update_data.get('company_id', db_product.company_id)
    item_code = update_data.get('item_code', db_product.item_code)
    barcode = update_data.get('barcode', db_product.barcode)

    if company_id:
        existing = db.query(Product).filter(
            Product.company_id == company_id,
            Product.id != product_id  # Exclude the product we are currently updating
        ).filter(
            (Product.item_code == item_code) | (Product.barcode == barcode)
        ).first()

        if existing:
            if existing.item_code == item_code:
                raise ValueError(f"Item Code '{item_code}' already exists for this company.")
            if existing.barcode == barcode:
                raise ValueError(f"Barcode '{barcode}' already exists for this company.")

    for key, value in update_data.items():
        setattr(db_product, key, value)
        
    try:
        db.commit()
        db.refresh(db_product)
        return db_product
    except IntegrityError as e:
        db.rollback()
        # EXPOSE THE REAL DATABASE ERROR SO WE CAN SEE WHICH CONSTRAINT FAILED
        raise ValueError(f"Database constraint failed: {e.orig}")


def soft_delete_product(db: Session, product_id: int):
    db_product = get_product(db, product_id)
    if not db_product:
        return False
    
    db_product.is_active = False
    db_product.status = "INACTIVE"
    db.commit()
    return True