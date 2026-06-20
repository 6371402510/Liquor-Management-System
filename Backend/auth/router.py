from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from database import get_db
from .schema import LoginSchema, RegisterSchema, UpdateUserSchema, UserResponse
from .service import create_user, authenticate_user
from .utils import create_access_token, hash_password
from .dependencies import get_current_user, require_admin
from .model import User
from company.model import Company

router = APIRouter(prefix="/auth", tags=["Authentication"])

# ─── PUBLIC SIGNUP ───
@router.post("/register")
def register(user_data: RegisterSchema, db: Session = Depends(get_db)):
    user_data.role = "ADMIN"
    user = create_user(db, user_data)
    if not user:
        raise HTTPException(status_code=400, detail="Email already exists")
    return {"message": "Admin account created successfully"}

# ─── LOGIN ───
# ─── LOGIN ───
@router.post("/login")
def login(login_data: LoginSchema, db: Session = Depends(get_db)):
    user = authenticate_user(db, login_data.email, login_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token({
        "user_id": user.id,
        "role": user.role,
        "company_id": user.company_id
    })

    companies = []
    
    if user.role.upper() == "ADMIN":
        # Admin owns multiple companies
        companies = [{"id": c.id, "company_name": c.company_name} for c in db.query(Company).filter(Company.owner_id == user.id).all()]
        
    elif user.company_id:
        # ─── FIX: Fetch the single assigned company for MANAGER/SALESMAN ───
        comp = db.query(Company).filter(Company.id == user.company_id).first()
        if comp:
            companies = [{"id": comp.id, "company_name": comp.company_name}]

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "company_id": user.company_id,
            "companies": companies  # Now populated for Salesman/Manager too!
        }
    }
# ═══════════════════════════════════════════════════════════
# ─── GET LIST OF USERS (Admin Only) ───
# ═══════════════════════════════════════════════════════════
@router.get("/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    # 1. Find all companies owned by this Admin
    owned_companies = db.query(Company).filter(Company.owner_id == current_user.id).all()
    company_ids = [c.id for c in owned_companies]
    
    # 2. Find all users (Managers/Salesmen) belonging to those companies
    users = db.query(User).filter(
        User.company_id.in_(company_ids)
    ).all()
    
    return users

# ─── CREATE MANAGER/SALESMAN (Admin Only) ───
@router.post("/users")
def create_staff(
    user_data: RegisterSchema, 
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if user_data.role == "ADMIN":
        raise HTTPException(status_code=403, detail="Cannot create Admin accounts here")
    
    if user_data.company_id:
        company = db.query(Company).filter(Company.id == user_data.company_id, Company.owner_id == current_user.id).first()
        if not company:
            raise HTTPException(status_code=403, detail="You do not own this company")
    
    try:
        user = create_user(db, user_data)
        if not user:
            raise HTTPException(status_code=400, detail="Email already exists")
        return {"message": f"{user_data.role} created successfully"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/users/{user_id}", response_model=UserResponse)
def update_staff(
    user_id: int,
    user_data: UpdateUserSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    # 1. Find the user to update
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # 2. Verify ownership (user must belong to admin's company)
    if user.company_id:
        company = db.query(Company).filter(
            Company.id == user.company_id, 
            Company.owner_id == current_user.id
        ).first()
        if not company:
            raise HTTPException(status_code=403, detail="You do not have permission to edit this user")
    
    # 3. Update only provided fields
    if user_data.name is not None:
        user.name = user_data.name
    
    if user_data.email is not None:
        # Check if email is taken by another user
        existing = db.query(User).filter(
            User.email == user_data.email, 
            User.id != user_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use by another user")
        user.email = user_data.email
    
    if user_data.password is not None and user_data.password.strip() != "":
        user.password = hash_password(user_data.password)
    
    if user_data.role is not None:
        user.role = user_data.role
    
    if user_data.company_id is not None:
        company = db.query(Company).filter(
            Company.id == user_data.company_id, 
            Company.owner_id == current_user.id
        ).first()
        if not company:
            raise HTTPException(status_code=403, detail="You do not own this company")
        user.company_id = user_data.company_id
    
    if user_data.is_active is not None:
        user.is_active = user_data.is_active
    
    db.commit()
    db.refresh(user)
    return user
