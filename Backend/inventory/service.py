from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import or_
from inventory.model import Product
from inventory.schema import ProductCreate, ProductUpdate


SYNC_FIELDS = {
    "purchase_rate",
    "landing_cost",
    "mrp",
    "sale_price",
    "vat_rate",
    "margin_percent",
    "hsn_code",
    "brand",
    "category",
    "sub_category",
    "product_type",
    "bottle_size",
    "traditional_name",
    "bottles_per_case",
    "unit",
    "packing_type",
    "short_name",
}



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


# inventory/service.py

def create_product(db: Session, product_data: ProductCreate, target_company_ids: list[int] | None = None):
    """
    Create a product.
    - If target_company_ids is provided → create for EACH company.
    - Otherwise → create for the single company_id in product_data.
    Returns: single Product (1 company) or list of Products (multiple).
    """
    product_dict = product_data.model_dump(by_alias=False)

    if target_company_ids:
        company_ids = target_company_ids
    else:
        cid = product_dict.get('company_id')
        if not cid:
            raise ValueError("company_id is required")
        company_ids = [cid]

    created_products = []

    for cid in company_ids:
        row = dict(product_dict)
        row['company_id'] = cid

        item_code = row.get('item_code')
        barcode   = _clean_empty_strings(row.get('barcode'))
        sort_key  = _clean_empty_strings(row.get('sort_key'))

        # Skip if product already exists for this company (by item_code)
        existing = db.query(Product).filter(
            Product.company_id == cid,
            Product.item_code == item_code,
        ).first()
        if existing:
            continue

        # Raise error on barcode / sort_key duplicates within the same company
        _check_duplicates(db, cid, item_code, barcode, sort_key)

        row['barcode'] = barcode
        row['sort_key'] = sort_key

        db_product = Product(**row)
        db.add(db_product)
        try:
            db.flush()
        except IntegrityError as e:
            db.rollback()
            error_msg = str(e.orig) if e.orig else str(e)
            raise ValueError(f"Company {cid}: {error_msg}")

        created_products.append(db_product)

    try:
        db.commit()
        for p in created_products:
            db.refresh(p)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Database error: {str(e.orig)}")

    if not created_products:
        raise ValueError("Product already exists in all selected companies.")

    if len(created_products) == 1:
        return created_products[0]
    return created_products
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


def update_product_everywhere(
    db: Session,
    product_id: int,
    product_data: ProductUpdate,
    sync_fields: set[str] | None = None,
):
    """
    Update a product in its own company, then mirror the SYNC_FIELDS
    to all other companies that have a product with the same item_code.
    """
    sync_fields = sync_fields or SYNC_FIELDS

    # 1. Update the original product (as before)
    db_product = update_product(db, product_id, product_data)
    if not db_product:
        return None, 0

    # 2. Find all other products with the same item_code in other companies
    siblings = (
        db.query(Product)
        .filter(
            Product.item_code == db_product.item_code,
            Product.id != db_product.id,
            Product.company_id != db_product.company_id,
        )
        .all()
    )

    if not siblings:
        return db_product, 0

    # 3. Copy the sync fields only
    #    product_data.model_dump(exclude_unset=True) gives us only what the user edited
    update_data = product_data.model_dump(exclude_unset=True, by_alias=False)

    # Normalise VAT key (frontend sends VAT_rate, DB column is vat_rate)
    if "VAT_rate" in update_data and "vat_rate" not in update_data:
        update_data["vat_rate"] = update_data.pop("VAT_rate")

    synced = 0
    for sib in siblings:
        changed = False
        for field in sync_fields:
            if field in update_data:
                value = update_data[field]
                if getattr(sib, field, None) != value:
                    setattr(sib, field, value)
                    changed = True
        if changed:
            synced += 1

    try:
        db.commit()
        db.refresh(db_product)
    except IntegrityError as e:
        db.rollback()
        raise ValueError(f"Failed to sync: {str(e.orig)}")

    return db_product, synced