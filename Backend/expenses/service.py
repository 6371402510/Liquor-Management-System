# expenses/service.py

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List, Optional
from datetime import date

from .model import Expense, ExpenseCategory
from .schema import ExpenseCreate, ExpenseUpdate, CategoryCreate

DEFAULT_CATEGORIES = ['SALARY_PAYOUT', 'ADVANCE_SALARY']
# --- Expense Services ---
def get_expenses(
    db: Session, 
    company_id: int,  # ← ADDED
    skip: int = 0, 
    limit: int = 1000,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None
):
    """Fetch expenses filtered by company and optional date range"""
    query = db.query(Expense).filter(Expense.company_id == company_id)  # ← ADDED FILTER
    
    if start_date:
        query = query.filter(Expense.expense_date >= start_date)
    if end_date:
        query = query.filter(Expense.expense_date <= end_date)
        
    return query.order_by(Expense.expense_date.desc()).offset(skip).limit(limit).all()

def get_expense(db: Session, expense_id: int, company_id: int):  # ← ADDED company_id
    return db.query(Expense).filter(Expense.id == expense_id, Expense.company_id == company_id).first()

def create_expense(db: Session, expense_data: ExpenseCreate):
    db_expense = Expense(**expense_data.model_dump())
    try:
        db.add(db_expense)
        db.commit()
        db.refresh(db_expense)
        return db_expense
    except IntegrityError:
        db.rollback()
        return None

def update_expense(db: Session, expense_id: int, expense_data: ExpenseUpdate, company_id: int):  # ← ADDED
    db_expense = db.query(Expense).filter(Expense.id == expense_id, Expense.company_id == company_id).first()
    if not db_expense:
        return None
    
    update_data = expense_data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_expense, key, value)
        
    try:
        db.commit()
        db.refresh(db_expense)
        return db_expense
    except IntegrityError:
        db.rollback()
        return None

def delete_expense(db: Session, expense_id: int, company_id: int):  # ← ADDED
    db_expense = db.query(Expense).filter(Expense.id == expense_id, Expense.company_id == company_id).first()
    if not db_expense:
        return False
    
    db.delete(db_expense)
    db.commit()
    return True

# --- Category Services ---
def get_categories(db: Session, company_id: int) -> List[ExpenseCategory]:
    """Fetch categories for a company. Seed defaults if they are missing."""
    categories = db.query(ExpenseCategory).filter(ExpenseCategory.company_id == company_id).all()
    
    # LOGIC FIX: Check which defaults are actually missing
    existing_names = {c.name for c in categories}
    missing_defaults = [name for name in DEFAULT_CATEGORIES if name not in existing_names]
    
    if missing_defaults:
        try:
            for cat_name in missing_defaults:
                db.add(ExpenseCategory(name=cat_name, is_default=True, company_id=company_id))
            db.commit()
            # Refresh the list to include the newly seeded categories
            return db.query(ExpenseCategory).filter(ExpenseCategory.company_id == company_id).all()
        except IntegrityError:
            db.rollback()
            # Fallback if something went wrong
            return db.query(ExpenseCategory).filter(ExpenseCategory.company_id == company_id).all()
        
    return categories

def create_category(db: Session, category_data: CategoryCreate) -> ExpenseCategory:
    clean_name = category_data.name.strip().upper().replace(" ", "_")
    
    # Check if category already exists for this company
    existing = db.query(ExpenseCategory).filter(
        ExpenseCategory.company_id == category_data.company_id,
        ExpenseCategory.name == clean_name
    ).first()
    if existing:
        raise ValueError("Category already exists for this company")
    
    db_category = ExpenseCategory(name=clean_name, is_default=False, company_id=category_data.company_id)
    try:
        db.add(db_category)
        db.commit()
        db.refresh(db_category)
        return db_category
    except IntegrityError:
        db.rollback()
        raise ValueError("Category already exists")

def delete_category(db: Session, category_id: int, company_id: int) -> bool:  # ← ADDED
    db_category = db.query(ExpenseCategory).filter(
        ExpenseCategory.id == category_id,
        ExpenseCategory.company_id == company_id
    ).first()
    if not db_category:
        return False
    
    try:
        db.delete(db_category)
        db.commit()
        return True
    except IntegrityError:
        db.rollback()
        raise ValueError("Cannot delete this category because it is currently being used by existing expenses.")