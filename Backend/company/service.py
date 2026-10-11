from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from .model import Company
from .schema import CompanyCreate, CompanyUpdate
from license.model import License   # ← NEW


def _clean_empty_strings(data: dict) -> dict:
    return {k: (None if v == "" else v) for k, v in data.items()}


def get_companies(db: Session, owner_id: int = None, skip: int = 0, limit: int = 100):
    query = db.query(Company)
    if owner_id:
        query = query.filter(Company.owner_id == owner_id)
    return query.order_by(Company.created_at.desc()).offset(skip).limit(limit).all()


def get_company(db: Session, company_id: int):
    return db.query(Company).filter(Company.id == company_id).first()


def create_company(db: Session, company_data: CompanyCreate, owner_id: int = None):
    # ─── ENFORCE COMPANY LIMIT ───
    active_license = db.query(License).filter(License.is_active == True).first()
    if not active_license:
        raise ValueError("No active license found")

    if active_license.max_companies is not None:
        current_count = (
            db.query(Company)
            .filter(Company.owner_id == owner_id)
            .count()
        )
        if current_count >= active_license.max_companies:
            raise ValueError(
                f"Company limit reached. Your license allows a maximum of "
                f"{active_license.max_companies} compan{'y' if active_license.max_companies == 1 else 'ies'}."
            )

    company_dict = _clean_empty_strings(company_data.model_dump(by_alias=False))
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

    update_data = _clean_empty_strings(company_data.model_dump(exclude_unset=True, by_alias=False))
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