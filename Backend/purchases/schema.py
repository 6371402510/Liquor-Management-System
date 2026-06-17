from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List
from datetime import date 

# --- Item Schemas ---
class PurchaseItemBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    product_id: Optional[int] = None
    company_id: Optional[int] = None # ─── ADDED
    product_name: str = Field(alias="name")
    brand: Optional[str] = None
    category: Optional[str] = None
    barcode: Optional[str] = None
    bottle_size: Optional[str] = Field(default=None, alias="bottle_size")
    traditional_name: Optional[str] = Field(default=None, alias="traditional_name")
    bottles_per_case: int = Field(default=0, alias="bottles_per_case")
    mrp: float = 0.0
    unit_cost: float = Field(default=0.0, alias="purchaseRate")
    purchase_rate_per_unit: float = Field(default=0.0, alias="purchaseRatePerUnit")
    selling_rate: float = Field(default=0.0, alias="sellingRate")
    qty_cases: int = Field(default=0, alias="qtyCases")
    qty_bottles: int = Field(default=0, alias="qtyBottles")
    total_bottles: int = Field(default=0, alias="totalBottles")
    qty_bulk_liters: float = Field(default=0.0, alias="qtyBulkLiters")
    qty_lp_liters: float = Field(default=0.0, alias="qtyLPLiters")
    opening_stock: int = Field(default=0, alias="openingStock")
    min_stock: int = Field(default=0, alias="minStock")
    total_cost: float = 0.0


class PurchaseItemCreate(PurchaseItemBase):
    pass


class PurchaseItemResponse(PurchaseItemBase):
    id: int
    purchase_id: int

    class Config:
        from_attributes = True


# --- Purchase Schemas ---
class PurchaseBase(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    invoice_number: str
    company_id: Optional[int] = None # ─── ADDED
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None

    purchase_date: Optional[date] = None
    invoice_date: Optional[date] = None       
    billing_date: Optional[date] = None       

    subtotal: float = 0.0
    vat_amount: float = 0.0
    cess_amount: float = 0.0
    special_amount: float = 0.0
    tcs_amount: float = 0.0
    total_amount: float = 0.0
    notes: Optional[str] = None
    vehicle_number: Optional[str] = None      
    status: str = "RECEIVED"


class PurchaseCreate(PurchaseBase):
    items: List[PurchaseItemCreate]


class PurchaseResponse(PurchaseBase):
    id: int
    created_at: Optional[date] = None         
    updated_at: Optional[date] = None         

    class Config:
        from_attributes = True


# Add this after PurchaseCreate class

class PurchaseUpdate(PurchaseBase):
    """Same as PurchaseCreate — used for editing"""
    items: List[PurchaseItemCreate]