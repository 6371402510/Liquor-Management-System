from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base

class StockTransfer(Base):
    __tablename__ = "stock_transfers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=True, index=True) # ─── ADDED
    transfer_number = Column(String, unique=True, index=True, nullable=False)
    transfer_date = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text, nullable=True)
    status = Column(String, default="COMPLETED")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class StockTransferItem(Base):
    __tablename__ = "stock_transfer_items"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=True, index=True) # ─── ADDED
    transfer_id = Column(Integer, ForeignKey("stock_transfers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name = Column(String, nullable=False)
    quantity = Column(Integer, default=0)
    cases = Column(Integer, default=0)              # ─── ADDED
    bottles_per_case = Column(Integer, default=0)    # ─── ADDED