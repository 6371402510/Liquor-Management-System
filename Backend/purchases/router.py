from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .service import get_purchases_with_items
from datetime import date

from database import get_db
from .schema import PurchaseCreate, PurchaseResponse, PurchaseItemResponse,PurchaseUpdate
from .service import get_purchases, create_purchase, get_purchase_items,update_purchase, get_purchase,check_invoice_number_exists

router = APIRouter(
    prefix="/purchases",
    tags=["Purchases"]
)

@router.get("/", response_model=List[PurchaseResponse])
def list_purchases(
    company_id: int | None = None, # ─── ADDED
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db)
):
    """Get all purchases, optionally filtered by company_id"""
    return get_purchases(db, company_id=company_id, skip=skip, limit=limit)

# @router.post("/", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
# def create_new_purchase(purchase_data: PurchaseCreate, db: Session = Depends(get_db)):
#     """Create a new purchase with items"""
#     try:
#         return create_purchase(db, purchase_data)
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(status_code=400, detail=f"Failed to create purchase: {str(e)}")

@router.get("/{purchase_id}/items", response_model=List[PurchaseItemResponse])
def list_purchase_items(purchase_id: int, db: Session = Depends(get_db)):
    """Get all items for a specific purchase"""
    items = get_purchase_items(db, purchase_id)
    if not items:
        raise HTTPException(status_code=404, detail="No items found for this purchase")
    return items


# @router.put("/{purchase_id}", response_model=PurchaseResponse)
# def update_existing_purchase(
#     purchase_id: int, 
#     purchase_data: PurchaseCreate,   # reuse PurchaseCreate schema
#     db: Session = Depends(get_db)
# ):
#     """Update an existing purchase (replaces header + items, reverses old stock)"""
#     try:
#         updated = update_purchase(db, purchase_id, purchase_data)
#         if not updated:
#             raise HTTPException(status_code=404, detail="Purchase not found")
#         return updated
#     except HTTPException:
#         raise
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(status_code=400, detail=f"Failed to update purchase: {str(e)}")


@router.post("/", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
def create_new_purchase(purchase_data: PurchaseCreate, db: Session = Depends(get_db)):
    """Create a new purchase with items"""
    try:
        return create_purchase(db, purchase_data)
    except ValueError as e:
        # Catch the duplicate invoice error
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create purchase: {str(e)}")

@router.put("/{purchase_id}", response_model=PurchaseResponse)
def update_existing_purchase(
    purchase_id: int, 
    purchase_data: PurchaseCreate,
    db: Session = Depends(get_db)
):
    """Update an existing purchase (replaces header + items, reverses old stock)"""
    try:
        updated = update_purchase(db, purchase_id, purchase_data)
        if not updated:
            raise HTTPException(status_code=404, detail="Purchase not found")
        return updated
    except ValueError as e:
        # Catch the duplicate invoice error
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to update purchase: {str(e)}")

@router.get("/check-invoice/")
def check_invoice_exists(
    invoice_number: str,
    company_id: int,
    exclude_purchase_id: int | None = None,
    db: Session = Depends(get_db)
):
    """Check if an invoice number already exists"""
    exists = check_invoice_number_exists(db, invoice_number, exclude_purchase_id)
    return {"exists": exists}




@router.get("/report-data/")
def report_data(
    company_id: int,
    date_from: date | None = None,
    date_to: date | None = None,
    db: Session = Depends(get_db)
):
    """
    Returns purchases with items in a single call, filtered by date range.
    Much faster than fetching items one-by-one from the frontend.
    """
    purchases = get_purchases_with_items(
        db, company_id=company_id, date_from=date_from, date_to=date_to
    )
    
    result = []
    for p in purchases:
        result.append({
            "id": p.id,
            "billing_date": p.billing_date.isoformat() if p.billing_date else None,
            "purchase_date": p.purchase_date.isoformat() if p.purchase_date else None,
            "invoice_number": p.invoice_number,
            "stock_destination": p.stock_destination,
            "items": [
                {
                    "product_id": it.product_id,
                    "product_name": it.product_name,
                    "short_name": it.short_name,
                    "bottle_size": it.bottle_size,
                    "bottles_per_case": it.bottles_per_case,
                    "qty_cases": it.qty_cases,
                    "qty_bottles": it.qty_bottles,
                    "total_bottles": it.total_bottles,
                }
                for it in p.items
            ],
        })
    return result