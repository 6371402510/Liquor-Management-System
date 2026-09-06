# expenses/schema.py

from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import date, datetime
class ExpenseBase(BaseModel):
    company_id: int
    expense_date: date
    category_id: int        # ← CHANGED from `category: str`
    amount: float
    payment_method: str = "CASH"
    description: Optional[str] = None
    
    employee_name: Optional[str] = None
    designation: Optional[str] = None
    
    vendor_name: Optional[str] = None
    receipt_number: Optional[str] = None
    status: Optional[str] = None

class ExpenseCreate(ExpenseBase):
    pass

class ExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    category_id: Optional[int] = None   # ← CHANGED
    amount: Optional[float] = None
    payment_method: Optional[str] = None
    description: Optional[str] = None
    employee_name: Optional[str] = None
    designation: Optional[str] = None
    vendor_name: Optional[str] = None
    receipt_number: Optional[str] = None
    status: Optional[str] = None
    company_id: int



class ExpenseResponse(BaseModel):
    id: int
    company_id: int
    category_id: int           # ← ADDED
    category: Optional[str] = None  # ← ADDED (populated from relationship property)
    expense_date: date
    amount: float
    payment_method: str
    description: Optional[str] = None
    employee_name: Optional[str] = None
    designation: Optional[str] = None
    vendor_name: Optional[str] = None
    receipt_number: Optional[str] = None
    status: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    previous_expenses_total: float = 0.0

    model_config = ConfigDict(from_attributes=True)

# --- Category Schemas ---
class CategoryBase(BaseModel):
    company_id: int  # ← ADDED
    name: str

class CategoryCreate(CategoryBase):
    pass

class CategoryResponse(CategoryBase):
    id: int
    is_default: bool = False

    model_config = ConfigDict(from_attributes=True)
