from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from datetime import date as date_type 
from .model import Purchase, PurchaseItem
from .schema import PurchaseCreate
from inventory.model import Product


def get_purchases(db: Session, company_id: int | None = None, skip: int = 0, limit: int = 1000):
    query = db.query(Purchase)
    if company_id is not None:
        query = query.filter(Purchase.company_id == company_id)
    return query.order_by(Purchase.purchase_date.desc()).offset(skip).limit(limit).all()


def get_purchase(db: Session, purchase_id: int):
    return db.query(Purchase).filter(Purchase.id == purchase_id).first()


def get_purchase_items(db: Session, purchase_id: int):
    return db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()


# ─── HELPER: Apply stock to the correct location ───
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

    # Always recalculate current_stock = godown + counter
    product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)


# ─── HELPER: Update purchase rate on product ───
def _update_product_rate(product, item_data, total_bottles):
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
        product.landing_cost = rate_per_unit


# ─── HELPER: Calculate total bottles from item ───
def _calc_total_bottles(item):
    total_bottles = item.total_bottles or 0
    if total_bottles == 0 and item.qty_cases > 0:
        total_bottles = item.qty_cases * (item.bottles_per_case or 1)
    return total_bottles


def create_purchase(db: Session, purchase_data: PurchaseCreate):
    purchase_dict = purchase_data.model_dump(exclude={"items"}, by_alias=False)

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = purchase_dict.get("billing_date") or date_type.today()
    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

    destination = purchase_dict.get("stock_destination", "GODOWN")

    db_purchase = Purchase(**purchase_dict)

    try:
        db.add(db_purchase)
        db.flush()

        for item_data in purchase_data.items:
            item_dict = item_data.model_dump(by_alias=False)
            item_dict["purchase_id"] = db_purchase.id
            item_dict["company_id"] = db_purchase.company_id

            db_item = PurchaseItem(**item_dict)
            db.add(db_item)

            product_id = item_data.product_id
            if product_id:
                product = db.query(Product).filter(Product.id == product_id).first()
                if product:
                    total_bottles = _calc_total_bottles(item_data)

                    # ─── ADD STOCK TO CORRECT LOCATION ───
                    _apply_stock(product, total_bottles, destination, is_add=True)

                    if (product.opening_stock or 0) == 0:
                        product.opening_stock = total_bottles

                    _update_product_rate(product, item_data, total_bottles)

        db.commit()
        db.refresh(db_purchase)
        return db_purchase

    except IntegrityError:
        db.rollback()
        return None
    except Exception as e:
        db.rollback()
        raise e


def delete_purchase(db: Session, purchase_id: int):
    db_purchase = get_purchase(db, purchase_id)
    if not db_purchase:
        return False

    old_destination = db_purchase.stock_destination or "GODOWN"

    items = db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()
    for item in items:
        if item.product_id:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if product:
                total_bottles = _calc_total_bottles(item)
                # ─── REVERSE FROM CORRECT LOCATION ───
                _apply_stock(product, total_bottles, old_destination, is_add=False)

    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()
    db.delete(db_purchase)
    db.commit()
    return True


def update_purchase(db: Session, purchase_id: int, purchase_data: PurchaseCreate):
    db_purchase = get_purchase(db, purchase_id)
    if not db_purchase:
        return None

    # ─── SAVE OLD DESTINATION BEFORE OVERWRITING ───
    old_destination = db_purchase.stock_destination or "GODOWN"

    # ─── STEP 1: REVERSE OLD STOCK FROM OLD LOCATION ───
    old_items = db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()
    for old_item in old_items:
        if old_item.product_id:
            product = db.query(Product).filter(Product.id == old_item.product_id).first()
            if product:
                total_bottles = _calc_total_bottles(old_item)
                _apply_stock(product, total_bottles, old_destination, is_add=False)

    # ─── STEP 2: DELETE OLD ITEMS ───
    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()

    # ─── STEP 3: UPDATE PURCHASE HEADER ───
    purchase_dict = purchase_data.model_dump(exclude={"items"}, by_alias=False)

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = purchase_dict.get("billing_date") or date_type.today()
    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

    # New destination for adding stock
    new_destination = purchase_dict.get("stock_destination", "GODOWN")

    for key, value in purchase_dict.items():
        setattr(db_purchase, key, value)

    db.flush()

    # ─── STEP 4: CREATE NEW ITEMS + APPLY STOCK TO NEW LOCATION ───
    for item_data in purchase_data.items:
        item_dict = item_data.model_dump(by_alias=False)
        item_dict["purchase_id"] = db_purchase.id
        item_dict["company_id"] = db_purchase.company_id

        db_item = PurchaseItem(**item_dict)
        db.add(db_item)

        product_id = item_data.product_id
        if product_id:
            product = db.query(Product).filter(Product.id == product_id).first()
            if product:
                total_bottles = _calc_total_bottles(item_data)

                # ─── ADD STOCK TO NEW LOCATION ───
                _apply_stock(product, total_bottles, new_destination, is_add=True)

                _update_product_rate(product, item_data, total_bottles)

    try:
        db.commit()
        db.refresh(db_purchase)
        return db_purchase
    except Exception as e:
        db.rollback()
        raise e