from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from typing import Optional
from datetime import datetime

class ProductBase(BaseModel):
    model_config = ConfigDict(alias_generator=lambda x: x, populate_by_name=True)
    company_id: Optional[int] = None
    item_code: str
    barcode: Optional[str] = None
    sort_key: Optional[str] = None
    name: str
    short_name: Optional[str] = None
    brand: Optional[str] = None
    category: str
    sub_category: Optional[str] = None
    product_type: str
    bottle_size: Optional[str] = None
    traditional_name: Optional[str] = None
    bottles_per_case: int = 0
    unit: str
    packing_type: Optional[str] = None
    
    purchase_rate: Optional[float] = None
    landing_cost: float = 0.0
    mrp: float = 0.0
    sale_price: float = 0.0
    discount_allowed: bool = False
    discount_percent: float = 0.0
    vat_rate: float = Field(default=18.0, alias="VAT_rate")
    margin_percent: float = 0.0
    hsn_code: Optional[str] = None
    
    opening_stock: int = 0
    godown_stock: int = 0
    counter_stock: int = 0
    current_stock: int = 0
    reorder_level: int = 5
    maximum_stock: int = 0
    damage_stock: int = 0
    reserved_stock: int = 0
    stock_location: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[str] = None
    manufacture_date: Optional[str] = None
    
    fast_billing_key: Optional[str] = None
    favourite_item: bool = False
    allow_return: bool = True
    allow_exchange: bool = True
    print_name: Optional[str] = None
    
    barcode_type: Optional[str] = None
    barcode_print_qty: int = 1
    auto_barcode_generate: bool = False
    
    store_id: Optional[str] = None
    branch_name: Optional[str] = None
    transfer_allowed: bool = False
    
    status: str = 'ACTIVE'

    # ← NEW: Convert empty strings to None for fields with unique constraints
    @field_validator('barcode', 'sort_key', mode='before')
    @classmethod
    def empty_string_to_none(cls, v):
        if isinstance(v, str) and v.strip() == '':
            return None
        return v


class ProductCreate(ProductBase):
    pass

class ProductUpdate(ProductBase):
    item_code: Optional[str] = None
    name: Optional[str] = None
    category: Optional[str] = None
    product_type: Optional[str] = None
    sort_key: Optional[str] = None
    unit: Optional[str] = None


class BulkProductCreate(BaseModel):
    product_data: ProductCreate      # ← renamed from "product"
    company_ids: list[int]

class ProductResponse(ProductBase):
    id: int
    item_id: Optional[int] = None
    is_active: bool = True
    created_by: Optional[str] = None
    modified_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True