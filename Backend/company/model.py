from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from database import Base # Adjust import based on your project

class Company(Base):
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    
    company_name = Column(String, nullable=False, index=True)
    owner_name = Column(String, nullable=False)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    establishment_year = Column(String, nullable=True)
    
    # Excise & Compliance
    excise_license_no = Column(String, nullable=True)
    trade_license_no = Column(String, nullable=True)  # Added trade license field
    excise_license_expiry = Column(String, nullable=True)
    excise_zone = Column(String, nullable=True)
    gstin = Column(String, unique=True, index=True, nullable=True)
    pan = Column(String, nullable=True)
    mger_targeted_value = Column(Float, default=0.0)
    
    # Store Operations
    operating_hours = Column(String, nullable=True)
    dry_days_policy = Column(Text, nullable=True)
    
    # Default Taxes
    default_vat = Column(Float, default=18.0)
    default_cess = Column(Float, default=0.0)
    default_special = Column(Float, default=0.0)
    default_tcs = Column(Float, default=1.0)

    
    # Volume Standards REMOVED
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())