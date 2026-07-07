from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from database import Base

class CounterToGodownTransfer(Base):
    __tablename__ = "counter_to_godown_transfers"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    transfer_number = Column(String, unique=True, index=True, nullable=False)
    transfer_date = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text, nullable=True)
    status = Column(String, default="COMPLETED")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CounterToGodownTransferItem(Base):
    __tablename__ = "counter_to_godown_transfer_items"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, nullable=True, index=True)
    transfer_id = Column(Integer, ForeignKey("counter_to_godown_transfers.id"), nullable=False)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    product_name = Column(String, nullable=False)
    quantity = Column(Integer, default=0)