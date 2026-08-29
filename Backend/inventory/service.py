from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from inventory.model import Product
from inventory.schema import ProductCreate, ProductUpdate


def get_products(db: Session, skip: int = 0, limit: int = 1000):
    return db.query(Product).filter(Product.is_active == True).order_by(Product.name).offset(skip).limit(limit).all()


def get_product(db: Session, product_id: int):
    return db.query(Product).filter(Product.id == product_id).first()


def _clean_empty_strings(value):
    """Convert empty strings to None for database constraints"""
    if isinstance(value, str) and value.strip() == '':
        return None
    return value


def _check_duplicates(db: Session, company_id, item_code, barcode, sort_key=None, exclude_id=None):
    """Helper to safely check duplicates, ignoring NULL/empty values"""
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
    # ← FIXED: Check for both None AND empty string
    if sort_key is not None and sort_key != '':
        conditions.append(Product.sort_key == sort_key)

    if not conditions:
        return

    existing = db.query(Product).filter(*filters).filter(or_(*conditions)).first()

    if existing:
        if item_code and existing.item_code == item_code:
            raise ValueError(f"Item Code '{item_code}' already exists for this company.")
        if barcode and existing.barcode == barcode:
            raise ValueError(f"Barcode '{barcode}' already exists for this company.")
        if sort_key and sort_key != '' and existing.sort_key == sort_key:
            raise ValueError(f"Sort Key '{sort_key}' already exists for this company.")


def create_product(db: Session, product_data: ProductCreate):
    product_dict = product_data.model_dump(by_alias=False)

    company_id = product_dict.get('company_id')
    item_code = product_dict.get('item_code')
    barcode = product_dict.get('barcode')
    sort_key = product_dict.get('sort_key')

    # ← FIXED: Clean empty strings before checking duplicates
    sort_key = _clean_empty_strings(sort_key)
    barcode = _clean_empty_strings(barcode)
    
    _check_duplicates(db, company_id, item_code, barcode, sort_key)

    # ← FIXED: Clean empty strings in the dict before saving
    product_dict['sort_key'] = sort_key
    product_dict['barcode'] = barcode

    db_product = Product(**product_dict)

    try:
        db.add(db_product)
        db.commit()
        db.refresh(db_product)
        return db_product
    except IntegrityError as e:
        db.rollback()
        # ← FIXED: Better error message
        error_msg = str(e.orig) if e.orig else str(e)
        if 'sort_key' in error_msg.lower():
            raise ValueError(f"Sort Key already exists for this company.")
        if 'item_code' in error_msg.lower():
            raise ValueError(f"Item Code already exists for this company.")
        if 'barcode' in error_msg.lower():
            raise ValueError(f"Barcode already exists for this company.")
        raise ValueError(f"Database constraint failed: {error_msg}")


def update_product(db: Session, product_id: int, product_data: ProductUpdate):
    db_product = get_product(db, product_id)
    if not db_product:
        return None

    update_data = product_data.model_dump(exclude_unset=True, by_alias=False)

    company_id = update_data.get('company_id', db_product.company_id)
    item_code = update_data.get('item_code', db_product.item_code)
    barcode = update_data.get('barcode', db_product.barcode)
    sort_key = update_data.get('sort_key', db_product.sort_key)

    # ← FIXED: Clean empty strings before checking duplicates
    sort_key = _clean_empty_strings(sort_key)
    barcode = _clean_empty_strings(barcode)

    _check_duplicates(db, company_id, item_code, barcode, sort_key, exclude_id=product_id)

    # ← FIXED: Clean empty strings in update data
    if 'sort_key' in update_data:
        update_data['sort_key'] = sort_key
    if 'barcode' in update_data:
        update_data['barcode'] = barcode

    for key, value in update_data.items():
        setattr(db_product, key, value)

    try:
        db.commit()
        db.refresh(db_product)
        return db_product
    except IntegrityError as e:
        db.rollback()
        error_msg = str(e.orig) if e.orig else str(e)
        if 'sort_key' in error_msg.lower():
            raise ValueError(f"Sort Key already exists for this company.")
        if 'item_code' in error_msg.lower():
            raise ValueError(f"Item Code already exists for this company.")
        if 'barcode' in error_msg.lower():
            raise ValueError(f"Barcode already exists for this company.")
        raise ValueError(f"Database constraint failed: {error_msg}")


def soft_delete_product(db: Session, product_id: int):
    db_product = get_product(db, product_id)
    if not db_product:
        return False

    db_product.is_active = False
    db_product.status = "INACTIVE"
    db.commit()
    return True