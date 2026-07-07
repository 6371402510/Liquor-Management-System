from pydantic import BaseModel
from datetime import datetime, date
from typing import List, Optional

class DashboardStats(BaseModel):
    todaySales: float = 0
    todayOrders: int = 0
    totalProducts: int = 0
    lowStockCount: int = 0
    totalSuppliers: int = 0
    monthSales: float = 0
    monthPurchases: float = 0
    monthExpenses: float = 0
    totalEmployees: int = 0
    totalBottlesInStock: int = 0
    totalBottlesSold: int = 0
    totalBottlesPurchased: int = 0
    
    # ═══════════════════════════════════════════════════════════
    # MGR STATUS FIELDS
    # ═══════════════════════════════════════════════════════════
    monthly_mgr_target: float = 30890000.0  # Fixed Monthly Target
    achieved_mgr: float = 0                 # MGR achieved this month
    to_be_achieved_mgr: float = 0           # Remaining MGR to achieve
    mgr_percentage: float = 0               # Achievement percentage

class DailySale(BaseModel):
    date: str
    sales: float

class DailyPurchase(BaseModel):
    date: str
    purchases: float

class CategoryData(BaseModel):
    name: str
    value: int

class RecentSale(BaseModel):
    id: int
    invoice_number: str
    customer_name: str
    total_amount: float
    payment_mode: str
    created_at: datetime
    type: str = "COUNTER"

    class Config:
        from_attributes = True

class RecentPurchase(BaseModel):
    id: int
    invoice_number: str
    supplier_name: str
    total_amount: float
    billing_date: Optional[date] = None
    status: str

    class Config:
        from_attributes = True

class LowStockItem(BaseModel):
    id: int
    name: str
    category: str
    brand: Optional[str] = None
    bottle_size: Optional[str] = None
    current_stock: int
    reorder_level: int

    class Config:
        from_attributes = True

class ExpenseBreakdown(BaseModel):
    category: str
    total_amount: float

class PaymentModeBreakdown(BaseModel):
    mode: str
    total_amount: float

class TopSellingBrand(BaseModel):
    brand: str
    bottles_sold: int

class ExciseSummary(BaseModel):
    stock_bl: float
    stock_lpl: float
    stock_mger: float
    sold_bl: float
    sold_lpl: float

# ═══════════════════════════════════════════════════════════
# NEW: MGR STATUS SCHEMA (Separate for detailed view)
# ═══════════════════════════════════════════════════════════
class MGRStatus(BaseModel):
    monthly_target: float
    achieved: float
    to_be_achieved: float
    percentage: float
    percentage_display: str  # "45.5%"

class DashboardResponse(BaseModel):
    stats: DashboardStats
    dailySales: List[DailySale]
    dailyPurchases: List[DailyPurchase]
    categoryData: List[CategoryData]
    expenseBreakdown: List[ExpenseBreakdown]
    recentSales: List[RecentSale]
    recentPurchases: List[RecentPurchase]
    lowStockItems: List[LowStockItem]
    paymentModeBreakdown: List[PaymentModeBreakdown]
    topSellingBrands: List[TopSellingBrand]
    exciseSummary: ExciseSummary
    mgr_status: MGRStatus  # NEW