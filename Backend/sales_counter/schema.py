from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class SaleItemBase(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    unit_price: float
    discount: float = 0.0
    total_price: float
    company_id: Optional[int] = None # ─── ADDED

class SaleItemCreate(SaleItemBase):
    pass

class SaleItemResponse(SaleItemBase):
    id: int
    sale_id: int
    class Config:
        from_attributes = True

class SaleBase(BaseModel):
    invoice_number: str
    company_id: Optional[int] = None # ─── ADDED
    customer_name: Optional[str] = "Walk-in Customer"
    customer_phone: Optional[str] = None
    total_amount: float
    payment_mode: str = "CASH"
    created_at: Optional[datetime] = None  # ─── ADDED: Allow date modification

class SaleCreate(SaleBase):
    items: List[SaleItemCreate]

class SaleResponse(SaleBase):
    id: int
    status: str
    created_at: Optional[datetime] = None
    items: List[SaleItemResponse] = []
    class Config:
        from_attributes = True



class UpdateMrpRequest(BaseModel):
    product_id: int
    company_id: int
    new_mrp: float