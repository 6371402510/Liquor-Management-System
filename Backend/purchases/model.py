from sqlalchemy import Column, Integer, String, Float, Date, Text, ForeignKey
from sqlalchemy.sql import func
from database import Base
from sqlalchemy.orm import relationship 

class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    
    invoice_number = Column(String, unique=True, index=True, nullable=False)
    supplier_id = Column(Integer, ForeignKey("suppliers.id"), nullable=True)
    supplier_name = Column(String, nullable=True)

    purchase_date = Column(Date, nullable=False)
    invoice_date = Column(Date, nullable=True)       
    billing_date = Column(Date, nullable=False)      

    # ─── NEW: COUNTER or GODOWN ───
    stock_destination = Column(String, default="GODOWN", nullable=False)
    purchase_side = Column(String, default="LIQUOR", nullable=False)  # "LIQUOR" or "BEER"

    subtotal = Column(Float, default=0.0)
    vat_amount = Column(Float, default=0.0)
    cess_amount = Column(Float, default=0.0)
    special_amount = Column(Float, default=0.0)
    tcs_amount = Column(Float, default=0.0)
    

    handling_transport = Column(Float, default=0.0)
    handling_depot_exp = Column(Float, default=0.0)
    handling_pass_fees = Column(Float, default=0.0)
    handling_unloading = Column(Float, default=0.0)
    handling_other_name = Column(String, nullable=True)
    handling_other_amount = Column(Float, default=0.0)
    total_handling = Column(Float, default=0.0)
    total_amount = Column(Float, default=0.0)




    notes = Column(Text, nullable=True)              
    vehicle_number = Column(String, nullable=True)   
    token_number = Column(String, nullable=True)
    status = Column(String, default="RECEIVED")

    created_at = Column(Date, server_default=func.current_date())
    updated_at = Column(Date, onupdate=func.current_date())
    items = relationship("PurchaseItem", backref="purchase", cascade="all, delete-orphan")



class PurchaseItem(Base):
    __tablename__ = "purchase_items"

    id = Column(Integer, primary_key=True, index=True)
    purchase_id = Column(Integer, ForeignKey("purchases.id"), nullable=False)
    company_id = Column(Integer, nullable=True, index=True) # ─── ADDED
    
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)

    product_name = Column(String, nullable=False)
    short_name = Column(String, nullable=True)   # ← ADD THIS
    brand = Column(String, nullable=True)
    category = Column(String, nullable=True)
    barcode = Column(String, nullable=True)

    bottle_size = Column(String, nullable=True)
    traditional_name = Column(String, nullable=True)
    bottles_per_case = Column(Integer, default=0)

    mrp = Column(Float, default=0.0)

    

    unit_cost = Column(Float, default=0.0)
    purchase_rate_per_unit = Column(Float, default=0.0)
    selling_rate = Column(Float, default=0.0)

    qty_cases = Column(Integer, default=0)
    qty_bottles = Column(Integer, default=0)
    total_bottles = Column(Integer, default=0)
    qty_bulk_liters = Column(Float, default=0.0)
    qty_lp_liters = Column(Float, default=0.0)
    mger_value = Column(Float, default=0.0) 

    opening_stock = Column(Integer, default=0)
    min_stock = Column(Integer, default=0)
    total_cost = Column(Float, default=0.0)



    