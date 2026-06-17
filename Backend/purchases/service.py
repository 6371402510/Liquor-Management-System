from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from datetime import date as date_type 
from .model import Purchase, PurchaseItem
from .schema import PurchaseCreate
from inventory.model import Product


def get_purchases(db: Session, company_id: int | None = None, skip: int = 0, limit: int = 1000):
    # ─── ADDED COMPANY FILTER ───
    query = db.query(Purchase)
    if company_id is not None:
        query = query.filter(Purchase.company_id == company_id)
        
    return query.order_by(Purchase.purchase_date.desc()).offset(skip).limit(limit).all()


def get_purchase(db: Session, purchase_id: int):
    return db.query(Purchase).filter(Purchase.id == purchase_id).first()


def get_purchase_items(db: Session, purchase_id: int):
    return db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()


def create_purchase(db: Session, purchase_data: PurchaseCreate):
    purchase_dict = purchase_data.model_dump(
        exclude={"items"}, by_alias=False
    )

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = (
            purchase_dict.get("billing_date") or date_type.today()
        )

    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

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
                    total_bottles = item_data.total_bottles or 0

                    if total_bottles == 0 and item_data.qty_cases > 0:
                        total_bottles = item_data.qty_cases * (item_data.bottles_per_case or 1)

                    product.godown_stock = (product.godown_stock or 0) + total_bottles
                    product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)

                    if (product.opening_stock or 0) == 0:
                        product.opening_stock = total_bottles

                    # ═══════════════════════════════════════════════════════════
                    # ─── CALCULATE PURCHASE RATE PER BOTTLE ──────────────────
                    # ═══════════════════════════════════════════════════════════
                    rate_per_unit = 0.0

                    # PRIORITY 1: Use purchase_rate_per_unit from frontend
                    if item_data.purchase_rate_per_unit and item_data.purchase_rate_per_unit > 0:
                        rate_per_unit = item_data.purchase_rate_per_unit

                    # PRIORITY 2: Calculate from unit_cost (rate/case) ÷ bottles_per_case
                    elif item_data.unit_cost and item_data.unit_cost > 0:
                        bpc = product.bottles_per_case or item_data.bottles_per_case or 0
                        if bpc > 0:
                            rate_per_unit = item_data.unit_cost / bpc

                    # PRIORITY 3: Calculate from total_bottles and total_cost
                    elif total_bottles > 0 and item_data.total_cost and item_data.total_cost > 0:
                        rate_per_unit = item_data.total_cost / total_bottles

                    if rate_per_unit > 0:
                        product.purchase_rate = rate_per_unit   # ← Per BOTTLE
                        product.landing_cost = rate_per_unit    # ← Per BOTTLE

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

    items = db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()
    for item in items:
        if item.product_id:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if product:
                total_bottles = item.total_bottles or 0
                if total_bottles == 0 and item.qty_cases > 0:
                    total_bottles = item.qty_cases * (item.bottles_per_case or 1)

                product.godown_stock = max(0, (product.godown_stock or 0) - total_bottles)
                product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)

    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()
    db.delete(db_purchase)
    db.commit()
    return True



def update_purchase(db: Session, purchase_id: int, purchase_data: PurchaseCreate):
    db_purchase = get_purchase(db, purchase_id)
    if not db_purchase:
        return None

    # ─── STEP 1: REVERSE OLD STOCK CHANGES ───
    old_items = db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()
    for old_item in old_items:
        if old_item.product_id:
            product = db.query(Product).filter(Product.id == old_item.product_id).first()
            if product:
                total_bottles = old_item.total_bottles or 0
                if total_bottles == 0 and old_item.qty_cases > 0:
                    total_bottles = old_item.qty_cases * (old_item.bottles_per_case or 1)

                product.godown_stock = max(0, (product.godown_stock or 0) - total_bottles)
                product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)

    # ─── STEP 2: DELETE OLD ITEMS ───
    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()

    # ─── STEP 3: UPDATE PURCHASE HEADER ───
    purchase_dict = purchase_data.model_dump(exclude={"items"}, by_alias=False)

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = (
            purchase_dict.get("billing_date") or date_type.today()
        )
    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

    for key, value in purchase_dict.items():
        setattr(db_purchase, key, value)

    db.flush()

    # ─── STEP 4: CREATE NEW ITEMS + APPLY STOCK ───
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
                total_bottles = item_data.total_bottles or 0
                if total_bottles == 0 and item_data.qty_cases > 0:
                    total_bottles = item_data.qty_cases * (item_data.bottles_per_case or 1)

                product.godown_stock = (product.godown_stock or 0) + total_bottles
                product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)

                # Update purchase rate
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

    try:
        db.commit()
        db.refresh(db_purchase)
        return db_purchase
    except Exception as e:
        db.rollback()
        raise e