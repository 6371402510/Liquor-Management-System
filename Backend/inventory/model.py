from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, UniqueConstraint  # ← ADD UniqueConstraint
from sqlalchemy.sql import func
from database import Base

class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, unique=True, index=True, nullable=True) 
    company_id = Column(Integer, nullable=True, index=True) 
    
    # Basic Info
    # ↓↓↓ REMOVED unique=True from item_code ↓↓↓
    item_code = Column(String, index=True, nullable=False)
    # ↓↓↓ barcode was not unique=True, but we'll constrain it per company below ↓↓↓
    barcode = Column(String, index=True, nullable=True)
    sort_key = Column(String, index=True, nullable=True)
    
    name = Column(String, nullable=False, index=True)
    short_name = Column(String, nullable=True)
    brand = Column(String, nullable=True)
    category = Column(String, nullable=False, index=True)
    sub_category = Column(String, nullable=True)
    product_type = Column(String, nullable=False)
    bottle_size = Column(String, nullable=True)
    traditional_name = Column(String, nullable=True)
    bottles_per_case = Column(Integer, default=0)
    unit = Column(String, nullable=False)
    packing_type = Column(String, nullable=True)
    
    # Pricing & Tax
    purchase_rate = Column(Float, default=0.0, nullable=True)
    landing_cost = Column(Float, default=0.0)
    mrp = Column(Float, default=0.0)
    sale_price = Column(Float, default=0.0)
    discount_allowed = Column(Boolean, default=False)
    discount_percent = Column(Float, default=0.0)
    vat_rate = Column(Float, default=18.0) 
    margin_percent = Column(Float, default=0.0)
    hsn_code = Column(String, nullable=True)
    
    # Stock & Inventory
    opening_stock = Column(Integer, default=0)
    godown_stock = Column(Integer, default=0)
    counter_stock = Column(Integer, default=0)
    current_stock = Column(Integer, default=0)
    reorder_level = Column(Integer, default=5)
    maximum_stock = Column(Integer, default=0)
    damage_stock = Column(Integer, default=0)
    reserved_stock = Column(Integer, default=0)
    stock_location = Column(String, nullable=True)
    batch_number = Column(String, nullable=True)
    expiry_date = Column(String, nullable=True)
    manufacture_date = Column(String, nullable=True)
    
    # POS & Billing
    fast_billing_key = Column(String, nullable=True)
    favourite_item = Column(Boolean, default=False)
    allow_return = Column(Boolean, default=True)
    allow_exchange = Column(Boolean, default=True)
    print_name = Column(String, nullable=True)
    
    # Barcode
    barcode_type = Column(String, nullable=True)
    barcode_print_qty = Column(Integer, default=1)
    auto_barcode_generate = Column(Boolean, default=False)
    
    # Multi-Store
    store_id = Column(String, nullable=True)
    branch_name = Column(String, nullable=True)
    transfer_allowed = Column(Boolean, default=False)
    
    # Status & Audit
    status = Column(String, default='ACTIVE')
    is_active = Column(Boolean, default=True) 
    created_by = Column(String, nullable=True)
    modified_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # ↓↓↓ ADD COMPOSITE CONSTRAINTS ↓↓↓
    __table_args__ = (
        UniqueConstraint("company_id", "item_code", name="uq_product_company_item_code"),
        UniqueConstraint("company_id", "barcode", name="uq_product_company_barcode"),
        UniqueConstraint("company_id", "sort_key", name="uq_product_company_sort_key"), 
    )