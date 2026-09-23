from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from database import Base


class CompanyStockTransfer(Base):
    __tablename__ = "company_stock_transfers"

    id = Column(Integer, primary_key=True, index=True)
    transfer_number = Column(String, unique=True, index=True, nullable=False)

    # ─── SOURCE (from company) ───
    from_company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    from_company_name = Column(String, nullable=True)

    # ─── DESTINATION (to company) ───
    to_company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    to_company_name = Column(String, nullable=True)

    # ─── Transfer details ───
    transfer_date = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(Text, nullable=True)
    vehicle_number = Column(String, nullable=True)
    status = Column(String, default="COMPLETED")

    total_bottles = Column(Integer, default=0)
    total_items = Column(Integer, default=0)

    created_by = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class CompanyStockTransferItem(Base):
    __tablename__ = "company_stock_transfer_items"

    id = Column(Integer, primary_key=True, index=True)
    transfer_id = Column(Integer, ForeignKey("company_stock_transfers.id"), nullable=False, index=True)

    # Source product (in from_company)
    from_product_id = Column(Integer, ForeignKey("products.id"), nullable=False)

    # Destination product (in to_company) — matched by item_code, may be created if missing
    to_product_id = Column(Integer, ForeignKey("products.id"), nullable=True)

    product_name = Column(String, nullable=False)
    item_code = Column(String, nullable=True)
    barcode = Column(String, nullable=True)
    bottle_size = Column(String, nullable=True)

    bottles_per_case = Column(Integer, default=0)
    cases = Column(Integer, default=0)
    quantity = Column(Integer, default=0)   # total bottles transferred

    from_company_id = Column(Integer, nullable=False, index=True)
    to_company_id = Column(Integer, nullable=False, index=True)