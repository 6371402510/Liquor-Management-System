from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class CompanyTransferItemCreate(BaseModel):
    product_id: int          # source product id (in from_company)
    quantity: int            # total bottles
    cases: int = 0
    bottles_per_case: int = 0


class CompanyTransferCreate(BaseModel):
    from_company_id: int
    to_company_id: int
    notes: Optional[str] = None
    vehicle_number: Optional[str] = None
    items: List[CompanyTransferItemCreate]


class CompanyTransferItemOut(BaseModel):
    id: int
    from_product_id: int
    to_product_id: Optional[int]
    product_name: str
    item_code: Optional[str]
    bottle_size: Optional[str]
    cases: int
    quantity: int

    class Config:
        from_attributes = True


class CompanyTransferOut(BaseModel):
    id: int
    transfer_number: str
    from_company_id: int
    from_company_name: Optional[str]
    to_company_id: int
    to_company_name: Optional[str]
    transfer_date: datetime
    notes: Optional[str]
    status: str
    total_bottles: int
    total_items: int
    items: List[CompanyTransferItemOut] = []

    class Config:
        from_attributes = True


class CompanyTransferInvoiceItem(BaseModel):
    product_name: str
    bottle_size: Optional[str] = None
    rate_per_case: float = 0.0
    quantity_cases: int = 0
    quantity_units: int = 0
    total_amount: float = 0.0


class CompanyTransferInvoice(BaseModel):
    invoice_number: str
    transfer_number: str
    transfer_date: datetime
    
    from_company_id: int
    from_company_name: Optional[str]
    from_company_address: Optional[str] = None
    from_company_gst: Optional[str] = None
    from_company_phone: Optional[str] = None
    
    to_company_id: int
    to_company_name: Optional[str]
    to_company_address: Optional[str] = None
    to_company_gst: Optional[str] = None
    to_company_phone: Optional[str] = None
    
    vehicle_number: Optional[str] = None
    notes: Optional[str] = None
    
    items: List[CompanyTransferInvoiceItem] = []
    
    subtotal: float = 0.0
    total_cases: int = 0
    total_units: int = 0
    grand_total: float = 0.0
    
    class Config:
        from_attributes = True