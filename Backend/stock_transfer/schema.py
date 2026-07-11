from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

class TransferItemBase(BaseModel):
    product_id: int
    product_name: str
    quantity: int
    cases: int = 0              # ─── ADDED
    bottles_per_case: int = 0  
    company_id: Optional[int] = None

class TransferItemCreate(TransferItemBase):
    pass

class TransferItemResponse(TransferItemBase):
    id: int
    transfer_id: int
    class Config:
        from_attributes = True

class StockTransferBase(BaseModel):
    transfer_number: str
    company_id: Optional[int] = None
    notes: Optional[str] = None

class StockTransferCreate(StockTransferBase):
    items: List[TransferItemCreate]

class StockTransferResponse(StockTransferBase):
    id: int
    transfer_date: Optional[datetime] = None
    status: str = "COMPLETED"
    created_at: Optional[datetime] = None
    class Config:
        from_attributes = True