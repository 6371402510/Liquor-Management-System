from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime

class DamageBase(BaseModel):
    model_config = ConfigDict(alias_generator=lambda x: x, populate_by_name=True)
    
    company_id: Optional[int] = None
    product_id: Optional[int] = None
    product_name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    bottle_size: Optional[str] = None
    
    quantity: int
    reason: str
    notes: Optional[str] = None
    damage_date: Optional[str] = None
    image_url: Optional[str] = None
    damage_source: Optional[str] = 'COUNTER'
    recorded_by: Optional[int] = None

class DamageCreate(DamageBase):
    pass

class DamageUpdate(DamageBase):
    product_name: Optional[str] = None
    quantity: Optional[int] = None
    reason: Optional[str] = None

class DamageResponse(DamageBase):
    id: int
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True