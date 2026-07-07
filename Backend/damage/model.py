from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean
from sqlalchemy.sql import func
from database import Base

class Damage(Base):
    __tablename__ = "damages"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    
    # Product Details (Denormalized for fast history logging)
    product_id = Column(Integer, nullable=True, index=True)
    product_name = Column(String, nullable=False, index=True)
    brand = Column(String, nullable=True)
    category = Column(String, nullable=True)
    bottle_size = Column(String, nullable=True)
    
    # Damage Details
    quantity = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    notes = Column(Text, nullable=True)
    damage_date = Column(String, nullable=True) # Stored as 'YYYY-MM-DD'
    image_url = Column(String, nullable=True) 
    damage_source = Column(String, default='COUNTER') 
    
    # Audit
    recorded_by = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True) 
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())