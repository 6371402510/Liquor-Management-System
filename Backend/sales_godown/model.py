# model.py
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class GodownSale(Base):
    __tablename__ = "godown_sales"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    invoice_number = Column(String(50), unique=True, index=True)
    customer_name = Column(String(100))
    customer_phone = Column(String(15))
    total_amount = Column(Float, default=0.0)
    payment_mode = Column(String(20), default="CASH")
    payment_details = Column(JSON, nullable=True)  # ← NEW: Store split payment details [{"mode": "CASH", "amount": 500}, {"mode": "UPI", "amount": 300}]
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    items = relationship("GodownSaleItem", back_populates="sale", cascade="all, delete-orphan")


class GodownSaleItem(Base):
    __tablename__ = "godown_sale_items"

    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("godown_sales.id"))
    company_id = Column(Integer, nullable=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    
    product_name = Column(String(100))
    quantity = Column(Integer, default=0)
    unit_price = Column(Float, default=0.0)
    discount = Column(Float, default=0.0)
    total_price = Column(Float, default=0.0)

    sale = relationship("GodownSale", back_populates="items")