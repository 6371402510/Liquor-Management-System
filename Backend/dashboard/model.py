# models/mgr_tracking.py
from sqlalchemy import Column, Integer, Float, Date, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class MGRTracking(Base):
    __tablename__ = "mgr_tracking"
    
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    month = Column(Date, nullable=False)  # First day of the month
    base_target = Column(Float, default=0)
    carryover_from_previous = Column(Float, default=0)
    total_target = Column(Float, default=0)
    achieved_mgr = Column(Float, default=0)
    remaining_mgr = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    company = relationship("Company", back_populates="mgr_tracking")