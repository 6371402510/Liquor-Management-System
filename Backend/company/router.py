from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from .schema import CompanyCreate, CompanyUpdate, CompanyResponse
from .service import get_companies, get_company, create_company, update_company, delete_company
from auth.dependencies import get_current_user, require_admin
from auth.model import User

router = APIRouter(prefix="/companies", tags=["Companies"])

@router.get("/", response_model=List[CompanyResponse])
def list_companies(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # MANAGER/SALESMAN see only their assigned shop
    if current_user.role in ["MANAGER", "SALESMAN"]:
        company = get_company(db, current_user.company_id)
        return [company] if company else []
    
    # ADMIN sees only the shops THEY OWN
    return get_companies(db, owner_id=current_user.id)

@router.post("/", response_model=CompanyResponse, status_code=status.HTTP_201_CREATED)
def create_new_company(
    company_data: CompanyCreate, 
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin) # Only Admins create shops
):
    # Assign ownership to the logged-in Admin
    company = create_company(db, company_data, owner_id=current_user.id)
    if not company:
        raise HTTPException(status_code=400, detail="Company with this GSTIN/License already exists")
    return company

# (Keep update and delete, but add dependency: current_user: User = Depends(require_admin))


@router.put("/{company_id}", response_model=CompanyResponse)
def update_existing_company(
    company_id: int,
    company_data: CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin) # Only Admins can update
):
    """Update an existing company by ID"""
    updated_company = update_company(db, company_id, company_data)
    if not updated_company:
        raise HTTPException(status_code=404, detail="Company not found")
    return updated_company

@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_existing_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin) # Only Admins can delete
):
    """Delete a company by ID"""
    success = delete_company(db, company_id)
    if not success:
        raise HTTPException(status_code=404, detail="Company not found")
    return None