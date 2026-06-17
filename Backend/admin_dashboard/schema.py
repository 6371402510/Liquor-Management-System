from pydantic import BaseModel
from typing import List

class StorePerformance(BaseModel):
    id: int
    name: str
    sales: float
    cogs: float = 0.0        # ← NEW: Cost of Goods Sold (Purchase Rate)
    vat: float = 0.0         # ← NEW: VAT 35% on COGS
    tcs: float = 0.0         # ← NEW: TCS 2.7% on (COGS + VAT)
    expense: float
    profit: float
    employees: int

class AttendanceRecord(BaseModel):
    emp: str
    store: str
    checkin: str
    status: str

class ExpenseCategoryBreakdown(BaseModel):
    category: str
    total_amount: float

class PayrollSummary(BaseModel):
    total_employees: int
    total_salary: float
    overtime: float
    incentive: float
    net_payroll: float

class OperationsStats(BaseModel):
    total_stores: int
    total_employees: int
    present_today: int
    cash_in_hand: float
    total_stock_value: float
    total_stock_value_mrp: float      # ← ADD THIS (was missing too)
    total_bottles_in_stock: int = 0    # ← NEW
    total_bottles_sold: int = 0        # ← NEW
    total_bottles_purchased: int = 0   # ← NEW
# ─── NEW: Company-wise stock breakdown ───
class CompanyStockValue(BaseModel):
    company_id: int
    company_name: str
    stock_value: float        # total value at cost
    stock_value_mrp: float    # total value at MRP (optional)
    item_count: int    
    total_bottles: int = 0       # number of distinct liquor items

class OperationsDashboardResponse(BaseModel):
    stats: OperationsStats
    stores: List[StorePerformance]
    attendance: List[AttendanceRecord]
    monthly_expenses: List[ExpenseCategoryBreakdown]
    payroll_summary: PayrollSummary
    company_stock: List[CompanyStockValue]  # ← NEW