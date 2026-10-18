# mgr_tracking/schema.py
from pydantic import BaseModel
from datetime import datetime, date
from typing import List, Optional


class MGRReportStats(BaseModel):
    base_target: float = 0.0
    carryover: float = 0.0
    total_target: float = 0.0
    achieved: float = 0.0
    remaining: float = 0.0
    percentage: float = 0.0
    days_left: int = 0
    daily_target_needed: float = 0.0
    total_mgr_all_time: float = 0.0
    purchase_count: int = 0


class MGRMonthlyHistory(BaseModel):
    month: str
    base_target: float
    carryover: float
    total_target: float
    achieved: float
    remaining: float
    percentage: float


class MGRPurchaseBreakdown(BaseModel):
    id: int
    invoice_number: str
    billing_date: Optional[str] = None
    supplier_name: Optional[str] = None
    mgr_value: float
    created_at: datetime

    class Config:
        from_attributes = True


class MGRReportResponse(BaseModel):
    company_name: str
    current_month: str
    stats: MGRReportStats
    monthly_history: List[MGRMonthlyHistory]
    purchase_breakdown: List[MGRPurchaseBreakdown]


class MGRTrackingBase(BaseModel):
    company_id: int
    month: date
    base_target: float = 0.0
    carryover_from_previous: float = 0.0
    total_target: float = 0.0
    achieved_mgr: float = 0.0
    remaining_mgr: float = 0.0


class MGRTrackingResponse(MGRTrackingBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True