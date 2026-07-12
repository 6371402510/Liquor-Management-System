from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, Date
from sqlalchemy.sql import func
from database import Base # Adjust import based on your project

class License(Base):
    __tablename__ = "license"

    id = Column(Integer, primary_key=True)
    token = Column(String(255), unique=True, nullable=False, index=True)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)

    is_active = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())