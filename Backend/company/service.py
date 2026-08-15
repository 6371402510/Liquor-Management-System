from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .model import Company
from .schema import CompanyCreate, CompanyUpdate

# ─── Helper to fix empty string issues ───────────────────────
def _clean_empty_strings(data: dict) -> dict:
    """Convert empty strings to None to prevent unique constraint violations on nullable fields"""
    return {k: (None if v == "" else v) for k, v in data.items()}

def get_companies(db: Session, owner_id: int = None, skip: int = 0, limit: int = 100):
    query = db.query(Company)
    if owner_id:
        query = query.filter(Company.owner_id == owner_id)
    return query.order_by(Company.created_at.desc()).offset(skip).limit(limit).all()

def get_company(db: Session, company_id: int):
    return db.query(Company).filter(Company.id == company_id).first()

def create_company(db: Session, company_data: CompanyCreate, owner_id: int = None):
    # by_alias=False ensures keys are snake_case matching the SQLAlchemy model
    company_dict = company_data.model_dump(by_alias=False)
    
    # CLEAN EMPTY STRINGS → None (Fixes the GSTIN/License error)
    company_dict = _clean_empty_strings(company_dict)
    
    db_company = Company(**company_dict, owner_id=owner_id)
    
    try:
        db.add(db_company)
        db.commit()
        db.refresh(db_company)
        return db_company
    except IntegrityError:
        db.rollback()
        return None 

def update_company(db: Session, company_id: int, company_data: CompanyUpdate):
    db_company = get_company(db, company_id)
    if not db_company:
        return None
    
    # exclude_unset=True ensures only provided fields are updated
    # by_alias=False ensures snake_case keys
    update_data = company_data.model_dump(exclude_unset=True, by_alias=False)
    
    # CLEAN EMPTY STRINGS → None (Prevents errors on update too)
    update_data = _clean_empty_strings(update_data)
    
    for key, value in update_data.items():
        setattr(db_company, key, value)
        
    try:
        db.commit()
        db.refresh(db_company)
        return db_company
    except IntegrityError:
        db.rollback()
        return None

def delete_company(db: Session, company_id: int):
    db_company = get_company(db, company_id)
    if db_company:
        db.delete(db_company)
        db.commit()
        return True
    return False