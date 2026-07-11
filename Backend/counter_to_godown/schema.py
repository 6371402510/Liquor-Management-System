from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class CTGTransferItemBase(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    cases: int = 0              # ─── ADDED
    bottles_per_case: int = 0   # ─── ADDED
    company_id: Optional[int] = None
    company_id: Optional[int] = None


class CTGTransferItemCreate(CTGTransferItemBase):
    pass


class CTGTransferItemResponse(CTGTransferItemBase):
    id: int
    transfer_id: int

    class Config:
        from_attributes = True


class CTGTransferBase(BaseModel):
    transfer_number: str
    company_id: Optional[int] = None
    notes: Optional[str] = None


class CTGTransferCreate(CTGTransferBase):
    items: List[CTGTransferItemCreate]


class CTGTransferResponse(CTGTransferBase):
    id: int
    transfer_date: Optional[datetime] = None
    status: str = "COMPLETED"
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True