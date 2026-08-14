from sqlalchemy import Column, Integer, String, Boolean, ForeignKey
from database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, unique=True, nullable=False, index=True)  # Changed from email
    password = Column(String, nullable=False)
    
    # ADMIN (Shop Owner), MANAGER, SALESMAN
    role = Column(String, nullable=False, default="ADMIN") 
    
    # Null for ADMIN (they own multiple shops via Company.owner_id)
    # Required for MANAGER and SALESMAN
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True) 
    
    is_active = Column(Boolean, default=True)