from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from database import get_db
from .schema import GodownCheckoutRequest, GodownSaleResponse, GodownProductResponse
from .service import (
    get_godown_products, process_godown_checkout,
    get_godown_sale_by_id, update_godown_sale  # ← NEW imports
)
from .model import GodownSale

router = APIRouter(
    prefix="/api/godown",
    tags=["Godown POS"]
)

@router.get("/products", response_model=list[GodownProductResponse])
def get_products(
    company_id: int | None = None,
    search: str = Query("", alias="search"),
    db: Session = Depends(get_db)
):
    return get_godown_products(db, company_id=company_id, search=search)

@router.post("/checkout", response_model=GodownSaleResponse)
def process_checkout(
    checkout_data: GodownCheckoutRequest,
    db: Session = Depends(get_db)
):
    return process_godown_checkout(db, checkout_data)

@router.get("/sales", response_model=list[GodownSaleResponse])
def get_godown_sales_report(
    company_id: int | None = None,
    date_from: str = Query(None, alias="date_from"),
    date_to: str = Query(None, alias="date_to"),
    db: Session = Depends(get_db)
):
    query = db.query(GodownSale)
    if company_id is not None:
        query = query.filter(GodownSale.company_id == company_id)
    if date_from:
        query = query.filter(GodownSale.created_at >= date_from)
    if date_to:
        end_date = (datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        query = query.filter(GodownSale.created_at < end_date)
    return query.order_by(GodownSale.created_at.desc()).all()

# ═══════════════════════════════════════════════════════════════
# NEW: Get single godown sale by ID
# ═══════════════════════════════════════════════════════════════
@router.get("/sales/{sale_id}", response_model=GodownSaleResponse)
def get_single_godown_sale(sale_id: int, db: Session = Depends(get_db)):
    try:
        return get_godown_sale_by_id(db, sale_id)
    except ValueError as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=str(e))

# ═══════════════════════════════════════════════════════════════
# NEW: Update an existing godown sale
# ═══════════════════════════════════════════════════════════════
@router.put("/sales/{sale_id}", response_model=GodownSaleResponse)
def edit_godown_sale(
    sale_id: int,
    checkout_data: GodownCheckoutRequest,
    db: Session = Depends(get_db)
):
    from fastapi import HTTPException
    try:
        return update_godown_sale(db, sale_id, checkout_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to update godown sale")