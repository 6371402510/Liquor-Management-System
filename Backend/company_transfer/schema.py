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