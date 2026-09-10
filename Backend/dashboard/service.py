from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional

from company.model import Company
from expenses.model import Expense, ExpenseCategory
from employee.model import Employee
from inventory.model import Product
from purchases.model import Purchase, PurchaseItem
from sales_counter.model import Sale, SaleItem
from supplier.model import Supplier
from sales_godown.model import GodownSale, GodownSaleItem

from . import schema

# ─── HELPER: Safely extract ml from strings like '750ml' ───
def parse_size_ml(size_str):
    if not size_str:
        return 0
    digits = ''.join(filter(str.isdigit, str(size_str)))
    return int(digits) if digits else 0



def get_previous_month_remaining_mgr(db: Session, company_id: int, current_date: datetime.date) -> float:
    """Calculate remaining MGR from previous month that should be carried forward"""
    # Get the first day of current month
    current_month_start = datetime(current_date.year, current_date.month, 1).date()
    
    # Get the last day of previous month
    if current_date.month == 1:
        previous_month_start = datetime(current_date.year - 1, 12, 1).date()
        previous_month_end = datetime(current_date.year - 1, 12, 31).date()
    else:
        previous_month_start = datetime(current_date.year, current_date.month - 1, 1).date()
        previous_month_end = datetime(current_date.year, current_date.month - 1, 1).replace(
            day=1
        ) - timedelta(days=1)
        previous_month_end = previous_month_end.date() if hasattr(previous_month_end, 'date') else previous_month_end

    # Get previous month's target from company
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return 0.0
    
    # Previous month's target (could be stored in company table or a separate MGR tracking table)
    previous_month_target = float(company.mger_targeted_value or 30890000.0)
    
    # Calculate previous month's achieved MGR
    previous_month_achieved = float(
        db.query(func.coalesce(func.sum(PurchaseItem.mger_value), 0))
        .join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(
            and_(
                Purchase.company_id == company_id,
                Purchase.created_at >= previous_month_start,
                Purchase.created_at <= previous_month_end
            )
        )
        .scalar() or 0
    )
    
    # Calculate remaining MGR from previous month
    remaining_mgr = max(0, previous_month_target - previous_month_achieved)
    
    # Optional: Store previous month's remaining in a separate table for tracking
    # You might want to create a MGRTracking table to store this history
    
    return remaining_mgr



def get_dashboard_data(db: Session, company_id: Optional[int] = None, target_date_str: Optional[str] = None):
    # ═══════════════════════════════════════
    # DYNAMIC DATE LOGIC
    # ═══════════════════════════════════════
    if target_date_str:
        try:
            today_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        except ValueError:
            today_date = datetime.now().date()
    else:
        today_date = datetime.now().date()

    today_start = datetime.combine(today_date, datetime.min.time())
    month_start = datetime(today_date.year, today_date.month, 1)
    seven_days_ago = datetime.combine(today_date - timedelta(days=6), datetime.min.time())

    def company_filter(model):
        if company_id and hasattr(model, 'company_id'):
            return model.company_id == company_id
        return True

    # ═══════════════════════════════════════════════════════════════════════
    # FETCH COMPANY'S MGR TARGET WITH CARRYOVER LOGIC
    # ═══════════════════════════════════════════════════════════════════════
    DEFAULT_MGR_TARGET = 30890000.0  # Fallback if company not found or value is 0
    
    company = None
    if company_id:
        company = db.query(Company).filter(Company.id == company_id).first()
    
    # Get previous month's remaining MGR to carry forward
    previous_month_remaining = get_previous_month_remaining_mgr(db, company_id, today_date) if company_id else 0
    
    # Use company's mger_targeted_value + previous month's remaining
    if company and company.mger_targeted_value and company.mger_targeted_value > 0:
        BASE_MONTHLY_TARGET = float(company.mger_targeted_value)
    else:
        BASE_MONTHLY_TARGET = DEFAULT_MGR_TARGET
    
    # Current month's target = Base target + Previous month's remaining (carryover)
    MONTHLY_MGR_TARGET = BASE_MONTHLY_TARGET + previous_month_remaining

    # ═══════════════════════════════════════
    # 1. STATS
    # ═══════════════════════════════════════
    today_counter_data = db.query(func.coalesce(func.sum(Sale.total_amount), 0), func.count(Sale.id)).filter(and_(Sale.created_at >= today_start, Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).first()
    today_godown_data = db.query(func.coalesce(func.sum(GodownSale.total_amount), 0), func.count(GodownSale.id)).filter(and_(GodownSale.created_at >= today_start, GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).first()
    
    today_sales = float(today_counter_data[0] or 0) + float(today_godown_data[0] or 0)
    today_orders = (today_counter_data[1] or 0) + (today_godown_data[1] or 0)

    month_counter_sales = db.query(func.coalesce(func.sum(Sale.total_amount), 0)).filter(and_(Sale.created_at >= month_start, Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).scalar()
    month_godown_sales = db.query(func.coalesce(func.sum(GodownSale.total_amount), 0)).filter(and_(GodownSale.created_at >= month_start, GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).scalar()
    month_sales = float(month_counter_sales or 0) + float(month_godown_sales or 0)

    month_purchases = float(db.query(func.coalesce(func.sum(Purchase.total_amount), 0)).filter(and_(Purchase.created_at >= month_start, Purchase.created_at <= today_start + timedelta(days=1), company_filter(Purchase))).scalar() or 0)
    month_expenses = float(db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(and_(Expense.expense_date >= month_start.date(), Expense.expense_date <= today_date, company_filter(Expense))).scalar() or 0)
    
    total_products = db.query(func.count(Product.id)).filter(company_filter(Product)).scalar() or 0
    low_stock_count = db.query(func.count(Product.id)).filter(and_(Product.current_stock <= Product.reorder_level, company_filter(Product))).scalar() or 0
    total_suppliers = db.query(func.count(Supplier.id)).filter(and_(Supplier.is_active == True, company_filter(Supplier))).scalar() or 0
    total_employees = db.query(func.count(Employee.id)).filter(and_(Employee.status == "ACTIVE", company_filter(Employee))).scalar() or 0

    total_bottles_in_stock = db.query(func.coalesce(func.sum(Product.current_stock), 0)).filter(company_filter(Product)).scalar() or 0
    counter_bottles_sold = db.query(func.coalesce(func.sum(SaleItem.quantity), 0)).join(Sale, SaleItem.sale_id == Sale.id).filter(and_(Sale.created_at >= month_start, Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).scalar() or 0
    godown_bottles_sold = db.query(func.coalesce(func.sum(GodownSaleItem.quantity), 0)).join(GodownSale, GodownSaleItem.sale_id == GodownSale.id).filter(and_(GodownSale.created_at >= month_start, GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).scalar() or 0
    total_bottles_sold = int(counter_bottles_sold) + int(godown_bottles_sold)

    total_bottles_purchased = db.query(func.coalesce(func.sum(PurchaseItem.total_bottles), 0)).join(Purchase, PurchaseItem.purchase_id == Purchase.id).filter(and_(Purchase.created_at >= month_start, Purchase.created_at <= today_start + timedelta(days=1), company_filter(Purchase))).scalar() or 0

    # ═══════════════════════════════════════════════════════════════════════
    # MGR STATUS CALCULATION (Uses dynamic target with carryover)
    # ═══════════════════════════════════════════════════════════════════════
    # Pulling total MGER value (same query as excise_summary.stock_mger)
    achieved_mgr = float(
        db.query(func.coalesce(func.sum(PurchaseItem.mger_value), 0))
        .join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(company_filter(Purchase))
        .scalar() or 0
    )
    
    to_be_achieved_mgr = max(0, MONTHLY_MGR_TARGET - achieved_mgr)
    mgr_percentage = (achieved_mgr / MONTHLY_MGR_TARGET * 100) if MONTHLY_MGR_TARGET > 0 else 0

    stats = schema.DashboardStats(
        todaySales=today_sales, todayOrders=today_orders, monthSales=month_sales,
        monthPurchases=month_purchases, monthExpenses=month_expenses,
        totalProducts=total_products, lowStockCount=low_stock_count,
        totalSuppliers=total_suppliers, totalEmployees=total_employees,
        totalBottlesInStock=int(total_bottles_in_stock),
        totalBottlesSold=total_bottles_sold,
        totalBottlesPurchased=int(total_bottles_purchased),
        # MGR Fields
        monthly_mgr_target=MONTHLY_MGR_TARGET,
        achieved_mgr=achieved_mgr,
        to_be_achieved_mgr=to_be_achieved_mgr,
        mgr_percentage=round(mgr_percentage, 2),
        previous_month_carryover=previous_month_remaining  # Add this field to schema
    )


    # ═══════════════════════════════════════
    # 2. CHARTS
    # ═══════════════════════════════════════
    counter_daily_db = db.query(func.date(Sale.created_at).label('date'), func.coalesce(func.sum(Sale.total_amount), 0).label('sales')).filter(and_(Sale.created_at >= seven_days_ago, Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).group_by(func.date(Sale.created_at)).all()
    godown_daily_db = db.query(func.date(GodownSale.created_at).label('date'), func.coalesce(func.sum(GodownSale.total_amount), 0).label('sales')).filter(and_(GodownSale.created_at >= seven_days_ago, GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).group_by(func.date(GodownSale.created_at)).all()
    
    sales_map = {}
    for row in counter_daily_db: sales_map[str(row.date)] = float(row.sales)
    for row in godown_daily_db: sales_map[str(row.date)] = sales_map.get(str(row.date), 0) + float(row.sales)
    daily_sales_list = [schema.DailySale(date=(today_date - timedelta(days=i)).strftime('%b %d'), sales=sales_map.get(str(today_date - timedelta(days=i)), 0)) for i in range(6, -1, -1)]

    daily_purchases_db = db.query(func.date(Purchase.created_at).label('date'), func.coalesce(func.sum(Purchase.total_amount), 0).label('purchases')).filter(and_(Purchase.created_at >= seven_days_ago, Purchase.created_at <= today_start + timedelta(days=1), company_filter(Purchase))).group_by(func.date(Purchase.created_at)).all()
    purchases_map = {str(row.date): float(row.purchases) for row in daily_purchases_db}
    daily_purchases_list = [schema.DailyPurchase(date=(today_date - timedelta(days=i)).strftime('%b %d'), purchases=purchases_map.get(str(today_date - timedelta(days=i)), 0)) for i in range(6, -1, -1)]

    category_data_db = db.query(Product.category.label('name'), func.count(Product.id).label('value')).filter(company_filter(Product)).group_by(Product.category).all()
    category_data = [schema.CategoryData(name=row.name or 'OTHER', value=row.value) for row in category_data_db]

    expense_breakdown_db = db.query(ExpenseCategory.name.label('category'), func.coalesce(func.sum(Expense.amount), 0).label('total_amount')).join(ExpenseCategory, Expense.category_id == ExpenseCategory.id).filter(and_(Expense.expense_date >= month_start.date(), Expense.expense_date <= today_date, company_filter(Expense))).group_by(ExpenseCategory.name).all()
    expense_breakdown = [schema.ExpenseBreakdown(category=row.category or 'OTHER', total_amount=float(row.total_amount)) for row in expense_breakdown_db]

    # ═══════════════════════════════════════
    # 3. LISTS
    # ═══════════════════════════════════════
    recent_counter_sales = db.query(Sale).filter(and_(Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).order_by(Sale.created_at.desc()).limit(6).all()
    recent_godown_sales = db.query(GodownSale).filter(and_(GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).order_by(GodownSale.created_at.desc()).limit(6).all()
    
    all_recent_sales = []
    for s in recent_counter_sales: all_recent_sales.append(schema.RecentSale(id=s.id, invoice_number=s.invoice_number, customer_name=s.customer_name, total_amount=s.total_amount, payment_mode=s.payment_mode, created_at=s.created_at, type="COUNTER"))
    for s in recent_godown_sales: all_recent_sales.append(schema.RecentSale(id=s.id, invoice_number=s.invoice_number, customer_name=s.customer_name, total_amount=s.total_amount, payment_mode=s.payment_mode, created_at=s.created_at, type="GODOWN"))
    all_recent_sales.sort(key=lambda x: x.created_at, reverse=True)
    recent_sales = all_recent_sales[:6]

    recent_purchases = db.query(Purchase).filter(and_(Purchase.created_at <= today_start + timedelta(days=1), company_filter(Purchase))).order_by(Purchase.created_at.desc()).limit(6).all()
    low_stock_items = db.query(Product).filter(and_(Product.current_stock <= Product.reorder_level, company_filter(Product))).order_by(Product.current_stock.asc()).limit(5).all()

    # ═══════════════════════════════════════
    # 4. PAYMENT MODE & BRANDS
    # ═══════════════════════════════════════
    counter_modes = db.query(Sale.payment_mode.label('mode'), func.coalesce(func.sum(Sale.total_amount), 0).label('total_amount')).filter(and_(Sale.created_at >= month_start, Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).group_by(Sale.payment_mode).all()
    godown_modes = db.query(GodownSale.payment_mode.label('mode'), func.coalesce(func.sum(GodownSale.total_amount), 0).label('total_amount')).filter(and_(GodownSale.created_at >= month_start, GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).group_by(GodownSale.payment_mode).all()
    
    mode_map = {}
    for row in counter_modes: mode_map[row.mode.upper() or 'UNKNOWN'] = float(row.total_amount)
    for row in godown_modes: mode_map[row.mode.upper() or 'UNKNOWN'] = mode_map.get(row.mode.upper() or 'UNKNOWN', 0) + float(row.total_amount)
    payment_mode_breakdown = [schema.PaymentModeBreakdown(mode=mode, total_amount=amt) for mode, amt in mode_map.items()]

    counter_brands = db.query(Product.brand.label('brand'), func.coalesce(func.sum(SaleItem.quantity), 0).label('bottles_sold')).join(SaleItem, SaleItem.product_id == Product.id).join(Sale, SaleItem.sale_id == Sale.id).filter(and_(Sale.created_at >= month_start, Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).group_by(Product.brand).order_by(func.sum(SaleItem.quantity).desc()).limit(5).all()
    godown_brands = db.query(Product.brand.label('brand'), func.coalesce(func.sum(GodownSaleItem.quantity), 0).label('bottles_sold')).join(GodownSaleItem, GodownSaleItem.product_id == Product.id).join(GodownSale, GodownSaleItem.sale_id == GodownSale.id).filter(and_(GodownSale.created_at >= month_start, GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).group_by(Product.brand).order_by(func.sum(GodownSaleItem.quantity).desc()).limit(5).all()
    
    brand_map = {}
    for row in counter_brands: brand_map[row.brand or 'Unknown'] = int(row.bottles_sold)
    for row in godown_brands: brand_map[row.brand or 'Unknown'] = brand_map.get(row.brand or 'Unknown', 0) + int(row.bottles_sold)
    
    sorted_brands = sorted(brand_map.items(), key=lambda x: x[1], reverse=True)[:5]
    top_selling_brands = [schema.TopSellingBrand(brand=br, bottles_sold=qty) for br, qty in sorted_brands]

    # ═══════════════════════════════════════
    # 5. EXCISE SUMMARY
    # ═══════════════════════════════════════
    products_for_excise = db.query(Product.current_stock, Product.bottle_size, Product.product_type).filter(company_filter(Product)).all()
    stock_bl, stock_lpl = 0.0, 0.0
    
    # This is the working query that now matches achieved_mgr exactly
    stock_mger = db.query(
        func.coalesce(func.sum(PurchaseItem.mger_value), 0)
    ).join(
        Purchase, PurchaseItem.purchase_id == Purchase.id
    ).filter(
        company_filter(Purchase)
    ).scalar() or 0.0

    for p in products_for_excise:
        size_ml = parse_size_ml(p.bottle_size)
        stock = p.current_stock or 0
        if size_ml > 0 and stock > 0:
            bl = (stock * size_ml) / 1000
            stock_bl += bl
            if p.product_type != 'BEER': stock_lpl += bl * 0.75

    counter_sold_items = db.query(SaleItem.quantity.label('qty'), Product.bottle_size, Product.product_type).join(Product, SaleItem.product_id == Product.id).join(Sale, SaleItem.sale_id == Sale.id).filter(and_(Sale.created_at >= month_start, Sale.created_at <= today_start + timedelta(days=1), company_filter(Sale))).all()
    godown_sold_items = db.query(GodownSaleItem.quantity.label('qty'), Product.bottle_size, Product.product_type).join(Product, GodownSaleItem.product_id == Product.id).join(GodownSale, GodownSaleItem.sale_id == GodownSale.id).filter(and_(GodownSale.created_at >= month_start, GodownSale.created_at <= today_start + timedelta(days=1), company_filter(GodownSale))).all()
    
    sold_bl, sold_lpl = 0.0, 0.0
    for item in list(counter_sold_items) + list(godown_sold_items):
        size_ml = parse_size_ml(item.bottle_size)
        qty = item.qty or 0
        if size_ml > 0 and qty > 0:
            bl = (qty * size_ml) / 1000
            sold_bl += bl
            if item.product_type != 'BEER': sold_lpl += bl * 0.75

    excise_summary = schema.ExciseSummary(
        stock_bl=round(stock_bl, 2), 
        stock_lpl=round(stock_lpl, 2),
        stock_mger=round(stock_mger, 2),
        sold_bl=round(sold_bl, 2), 
        sold_lpl=round(sold_lpl, 2)
    )

    # ═══════════════════════════════════════════════════════════════════════
    # 6. MGR STATUS OBJECT (Uses dynamic target from company)
    # ═══════════════════════════════════════════════════════════════════════
    mgr_status = schema.MGRStatus(
        monthly_target=MONTHLY_MGR_TARGET,
        base_target=BASE_MONTHLY_TARGET,  # Add to schema
        previous_month_carryover=previous_month_remaining,  # Add to schema
        achieved=achieved_mgr,
        to_be_achieved=to_be_achieved_mgr,
        percentage=round(mgr_percentage, 2),
        percentage_display=f"{round(mgr_percentage, 2)}%"
    )

    return schema.DashboardResponse(
        stats=stats, 
        dailySales=daily_sales_list, 
        dailyPurchases=daily_purchases_list,
        categoryData=category_data, 
        expenseBreakdown=expense_breakdown,
        recentSales=recent_sales, 
        recentPurchases=recent_purchases, 
        lowStockItems=low_stock_items,
        paymentModeBreakdown=payment_mode_breakdown, 
        topSellingBrands=top_selling_brands,
        exciseSummary=excise_summary,
        mgr_status=mgr_status
    )