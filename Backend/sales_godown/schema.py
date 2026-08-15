# schema.py
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime

class GodownProductResponse(BaseModel):
    id: int
    company_id: Optional[int] = None
    item_code: Optional[str] = None
    barcode: Optional[str] = None
    name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    bottle_size: Optional[str] = None
    traditional_name: Optional[str] = None
    sale_price: float
    mrp: float
    godown_stock: int
    image_url: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True

class GodownCheckoutItem(BaseModel):
    product_id: Optional[int] = None 
    product_name: str
    quantity: int
    unit_price: float
    discount: float = 0.0
    total_price: float
    company_id: Optional[int] = None

class PaymentSplitDetail(BaseModel):
    mode: str  # CASH, UPI, CARD
    amount: float

class GodownCheckoutRequest(BaseModel):
    invoice_number: str
    company_id: Optional[int] = None 
    customer_name: str
    customer_phone: Optional[str] = ""
    total_amount: float
    payment_mode: str = "CASH"
    created_at: Optional[datetime] = None
    payment_details: Optional[List[PaymentSplitDetail]] = None  # ← NEW
    items: List[GodownCheckoutItem]

class GodownSaleItemResponse(BaseModel):
    id: Optional[int] = None
    product_id: Optional[int] = None
    product_name: str
    quantity: int
    unit_price: float
    discount: float
    total_price: float

    class Config:
        from_attributes = True

class GodownSaleResponse(BaseModel):
    id: Optional[int] = None
    invoice_number: str
    company_id: Optional[int] = None
    customer_name: str
    customer_phone: Optional[str] = ""
    total_amount: float
    payment_mode: str
    payment_details: Optional[List[Dict[str, Any]]] = None  # ← NEW
    created_at: datetime
    items: List[GodownSaleItemResponse]

    class Config:
        from_attributes = True