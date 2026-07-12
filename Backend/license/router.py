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

@router.post("/initialize", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED,)
def initialize(db: Session = Depends(get_db)):
    """
    Initialize the application with a 15-day trial license.
    This API should be called only once after successful registration.
    """

    license = initialize_license(db)

    if not license:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to initialize license."
        )

    return license

@router.post("/activate", response_model=LicenseResponse, status_code=status.HTTP_201_CREATED)
def create_new_license(license_data: LicenseActivate, db: Session = Depends(get_db)):
    """Create a new license"""
    license = activate_license(db, license_data.token)
    if not license:
        raise HTTPException(status_code=400, detail="Failed to create license")
    return license

@router.get("/status", response_model=LicenseResponse)
def get_license_status(db: Session = Depends(get_db)):
    license = get_active_license(db)

    if not license:
        raise HTTPException(
            status_code=404,
            detail="No active license found"
        )

    return license

