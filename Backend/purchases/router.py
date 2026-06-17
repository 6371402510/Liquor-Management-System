from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from .schema import PurchaseCreate, PurchaseResponse, PurchaseItemResponse,PurchaseUpdate
from .service import get_purchases, create_purchase, get_purchase_items,update_purchase, get_purchase

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

@router.post("/", response_model=PurchaseResponse, status_code=status.HTTP_201_CREATED)
def create_new_purchase(purchase_data: PurchaseCreate, db: Session = Depends(get_db)):
    """Create a new purchase with items"""
    try:
        return create_purchase(db, purchase_data)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to create purchase: {str(e)}")

@router.get("/{purchase_id}/items", response_model=List[PurchaseItemResponse])
def list_purchase_items(purchase_id: int, db: Session = Depends(get_db)):
    """Get all items for a specific purchase"""
    items = get_purchase_items(db, purchase_id)
    if not items:
        raise HTTPException(status_code=404, detail="No items found for this purchase")
    return items


@router.put("/{purchase_id}", response_model=PurchaseResponse)
def update_existing_purchase(
    purchase_id: int, 
    purchase_data: PurchaseCreate,   # reuse PurchaseCreate schema
    db: Session = Depends(get_db)
):
    """Update an existing purchase (replaces header + items, reverses old stock)"""
    try:
        updated = update_purchase(db, purchase_id, purchase_data)
        if not updated:
            raise HTTPException(status_code=404, detail="Purchase not found")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to update purchase: {str(e)}")