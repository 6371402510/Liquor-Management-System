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
            
            # ─── ADDED: Inherit company_id from purchase ───
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

                    # if (product.purchase_rate or 0) == 0 and item_data.unit_cost:
                    #     product.purchase_rate = item_data.unit_cost

                    if item_data.unit_cost and item_data.unit_cost > 0:
                        product.purchase_rate = item_data.unit_cost
                        product.landing_cost = item_data.unit_cost

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