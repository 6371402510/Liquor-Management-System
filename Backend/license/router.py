from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from .schema import LicenseResponse, LicenseActivate
from .service import (
    get_active_license, 
    activate_license,
    initialize_license, 
)

router = APIRouter(
    prefix="/license",
    tags=["Licensing"]
)

@router.post("/initialize", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED)
def initialize(db: Session = Depends(get_db)):
    """Initialize the application with a 7-day trial license."""
    try:
        license = initialize_license(db)
        return license
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to initialize license")

@router.post("/activate", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED)
def create_new_license(license_data: LicenseActivate, db: Session = Depends(get_db)):
    """Activate a new license"""
    try:
        license = activate_license(db, license_data.token)
        return license
    # ✅ Catch ValueError → clean 400 error (not 500 crash)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Real DB errors still 500, but with proper CORS headers
        raise HTTPException(status_code=500, detail=f"License activation failed: {str(e)}")

@router.get("/status", response_model=LicenseResponse)
def get_license_status(db: Session = Depends(get_db)):
    license = get_active_license(db)
    if not license:
        raise HTTPException(status_code=404, detail="No active license found")
    return license