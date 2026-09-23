# mgr_tracking/router.py
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from database import get_db
from . import service, schema

router = APIRouter(
    prefix="/mgr",
    tags=["MGR Tracking"]
)


@router.get("/report", response_model=schema.MGRReportResponse)
def get_mgr_report(
    company_id: int = Query(..., description="Company ID"),
    date: Optional[str] = Query(None, description="Target date YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """Get comprehensive MGR report with carryover tracking."""
    try:
        return service.get_mgr_report(db, company_id=company_id, target_date_str=date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tracking", response_model=schema.MGRTrackingResponse)
def get_mgr_tracking(
    company_id: int = Query(..., description="Company ID"),
    date: Optional[str] = Query(None, description="Target date YYYY-MM-DD"),
    db: Session = Depends(get_db)
):
    """Get MGR tracking record for a specific month."""
    from datetime import datetime
    
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            target_date = datetime.now().date()
    else:
        target_date = datetime.now().date()
    
    tracking = service.get_or_create_mgr_tracking(db, company_id, target_date)
    return tracking