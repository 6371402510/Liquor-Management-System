from sqlalchemy.orm import Session
from .model import User
from .schema import RegisterSchema
from .utils import hash_password, verify_password
import re

def normalize_phone(phone: str) -> str:
    """Normalize phone number to 10-digit format"""
    phone = re.sub(r'[\s\-]', '', phone)
    # Remove +91 prefix if present
    if phone.startswith('+91'):
        phone = phone[3:]
    elif phone.startswith('91') and len(phone) == 12:
        phone = phone[2:]
    return phone

def create_user(db: Session, user_data: RegisterSchema):
    # Normalize phone for consistent storage
    normalized_phone = normalize_phone(user_data.phone)
    
    existing_user = db.query(User).filter(User.phone == normalized_phone).first()
    if existing_user:
        return None

    # MANAGER and SALESMAN must have a company_id
    if user_data.role in ["MANAGER", "SALESMAN"] and not user_data.company_id:
        raise ValueError("Company ID is required for Manager and Salesman roles")

    new_user = User(
        name=user_data.name,
        phone=normalized_phone,  # Changed from email
        password=hash_password(user_data.password),
        role=user_data.role,
        company_id=user_data.company_id if user_data.role != "ADMIN" else None
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

def authenticate_user(db: Session, phone: str, password: str):
    # Normalize phone for lookup
    normalized_phone = normalize_phone(phone)
    
    user = db.query(User).filter(User.phone == normalized_phone).first()
    if not user or not verify_password(password, user.password):
        return None
    if not user.is_active:
        return None
    return user