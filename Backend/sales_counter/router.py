from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import date, datetime, timedelta
from database import get_db
from .schema import SaleCreate, SaleResponse, UpdateMrpRequest
from sqlalchemy.exc import IntegrityError  # ← ADD this import
from .service import (
    get_pos_products,
    create_sale,
    get_sales_report_service,
    get_sale_by_id,
    update_sale,
    update_product_mrp, 
     delete_sale, # ← NEW import
)
from .model import Sale
from inventory.schema import ProductResponse

router = APIRouter(prefix="/sales", tags=["POS & Sales"])


@router.get("/pos-products/", response_model=List[ProductResponse])
def list_pos_products(
    company_id: int | None = None,
    search: str = None,
    db: Session = Depends(get_db)
):
    return get_pos_products(db, company_id=company_id, search=search)




@router.post("/", response_model=SaleResponse)
def checkout(sale_data: SaleCreate, db: Session = Depends(get_db)):
    try:
        return create_sale(db, sale_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Duplicate entry: {str(e.orig)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to process sale: {str(e)}")

@router.get("/", response_model=List[SaleResponse])
def get_sales_report(
    company_id: Optional[int] = None,
    date_from: Optional[date] = Query(None),
    date_to: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    return get_sales_report_service(
        db,
        company_id=company_id,
        date_from=date_from,
        date_to=date_to,
    )


@router.get("/{sale_id}", response_model=SaleResponse)
def get_single_sale(sale_id: int, db: Session = Depends(get_db)):
    try:
        return get_sale_by_id(db, sale_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.put("/{sale_id}", response_model=SaleResponse)
def edit_sale(sale_id: int, sale_data: SaleCreate, db: Session = Depends(get_db)):
    try:
        return update_sale(db, sale_id, sale_data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=400, detail="Failed to update sale")


# ═══════════════════════════════════════════════════════════════
# NEW: Update product MRP from POS counter
# ═══════════════════════════════════════════════════════════════
@router.post("/update-mrp")
def update_mrp_endpoint(request: UpdateMrpRequest, db: Session = Depends(get_db)):
    try:
        result = update_product_mrp(db, request.product_id, request.company_id, request.new_mrp)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to update MRP: {str(e)}")


@router.delete("/{sale_id}")
def delete_sale_endpoint(sale_id: int, db: Session = Depends(get_db)):
    try:
        return delete_sale(db, sale_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete sale: {str(e)}")