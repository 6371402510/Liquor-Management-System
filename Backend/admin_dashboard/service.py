from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import List, Optional

from company.model import Company
from employee.model import Employee
from expenses.model import Expense, ExpenseCategory
from sales_counter.model import Sale, SaleItem
from sales_godown.model import GodownSale, GodownSaleItem
from employee_attendance.model import Attendance
from inventory.model import Product
from purchases.model import Purchase, PurchaseItem 

from . import schema

def get_operations_dashboard_data(db: Session, date_from: Optional[str] = None, date_to: Optional[str] = None):
    today = datetime.now().date()

    if not date_from:
        date_from = today.replace(day=1).isoformat()
    if not date_to:
        date_to = today.isoformat()

    start_date = datetime.strptime(date_from, "%Y-%m-%d").date()
    end_date = datetime.strptime(date_to, "%Y-%m-%d").date()

    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    start_date_str = start_date.isoformat()
    end_date_str = end_date.isoformat()

    companies = db.query(Company).all()

    total_sales_all = 0.0
    total_expenses_all = 0.0
    total_employees_all = 0
    present_period_all = 0
    total_stock_value_all = 0.0
    total_stock_mrp_all = 0.0

    # ─── NEW: Bottle aggregation variables ───
    total_bottles_in_stock_all = 0
    total_bottles_sold_all = 0
    total_bottles_purchased_all = 0

    store_performances = []
    company_stock_list = []

    for company in companies:
        company_name = (
            getattr(company, 'company_name', None)
            or getattr(company, 'name', None)
            or f"Store {company.id}"
        )

        # ─── SALES ───
        counter_sales = 0.0
        if hasattr(Sale, 'company_id'):
            counter_sales = db.query(
                func.coalesce(func.sum(Sale.total_amount), 0)
            ).filter(
                and_(
                    Sale.company_id == company.id,
                    Sale.created_at.between(start_datetime, end_datetime)
                )
            ).scalar()

        godown_sales = 0.0
        if hasattr(GodownSale, 'company_id'):
            godown_sales = db.query(
                func.coalesce(func.sum(GodownSale.total_amount), 0)
            ).filter(
                and_(
                    GodownSale.company_id == company.id,
                    GodownSale.created_at.between(start_datetime, end_datetime)
                )
            ).scalar()

        store_sales = float(counter_sales or 0) + float(godown_sales or 0)
        total_sales_all += store_sales

        # ─── EXPENSES ───
        store_expense = 0.0
        if hasattr(Expense, 'company_id'):
            store_expense = float(
                db.query(func.coalesce(func.sum(Expense.amount), 0)).filter(
                    and_(
                        Expense.company_id == company.id,
                        Expense.expense_date.between(start_date, end_date)
                    )
                ).scalar() or 0
            )
        total_expenses_all += store_expense

        # ─── EMPLOYEES ───
        emp_count = 0
        if hasattr(Employee, 'company_id'):
            emp_count = db.query(func.count(Employee.id)).filter(
                and_(Employee.company_id == company.id, Employee.status == "ACTIVE")
            ).scalar() or 0
        total_employees_all += emp_count

        # ─── ATTENDANCE ───
        present_count = 0
        if hasattr(Attendance, 'company_id'):
            present_count = db.query(func.count(Attendance.id)).filter(
                and_(
                    Attendance.company_id == company.id,
                    Attendance.date.between(start_date_str, end_date_str),
                    Attendance.status == "PRESENT"
                )
            ).scalar() or 0
        present_period_all += present_count


              # ═══════════════════════════════════════════════════
        # ─── NEW: PROFIT CALCULATION (Sales - COGS - Expenses) ───
        # ═══════════════════════════════════════════════════
        store_cogs = 0.0
        try:
            counter_cogs = db.query(
                func.coalesce(func.sum(SaleItem.quantity * func.coalesce(Product.purchase_rate, 0)), 0)
            ).join(Sale, SaleItem.sale_id == Sale.id
            ).join(Product, SaleItem.product_id == Product.id
            ).filter(
                and_(
                    Sale.company_id == company.id,
                    Sale.created_at.between(start_datetime, end_datetime)
                )
            ).scalar() or 0

            godown_cogs = db.query(
                func.coalesce(func.sum(GodownSaleItem.quantity * func.coalesce(Product.purchase_rate, 0)), 0)
            ).join(GodownSale, GodownSaleItem.sale_id == GodownSale.id
            ).join(Product, GodownSaleItem.product_id == Product.id
            ).filter(
                and_(
                    GodownSale.company_id == company.id,
                    GodownSale.created_at.between(start_datetime, end_datetime)
                )
            ).scalar() or 0

            store_cogs = float(counter_cogs) + float(godown_cogs)
        except Exception as e:
            print(f"COGS query failed for company {company.id}: {e}")

        # Calculate Taxes based on COGS
        store_vat = store_cogs * 0.35                       # VAT at 35% of Purchase Rate
        store_tcs = (store_cogs + store_vat) * 0.027        # TCS at 2.7% of (Purchase Rate + VAT)

        # New Profit Formula
        store_profit = store_sales - store_cogs - store_vat - store_tcs - store_expense

        store_performances.append(schema.StorePerformance(
            id=company.id,
            name=company_name,
            sales=store_sales,
            cogs=store_cogs,        # ← NEW
            vat=store_vat,          # ← NEW
            tcs=store_tcs,          # ← NEW
            expense=store_expense,
            profit=store_profit,
            employees=emp_count
        ))
        # ═══════════════════════════════════════════════════
        # ─── STOCK VALUE from Product table ───────────────
        # ═══════════════════════════════════════════════════
        stock_value = 0.0
        stock_value_mrp = 0.0
        item_count = 0
        total_bottles = 0

        try:
            stock_result = db.query(
                func.coalesce(
                    func.sum(Product.current_stock * Product.purchase_rate), 0
                ).label('total_cost'),
                func.coalesce(
                    func.sum(Product.current_stock * Product.mrp), 0
                ).label('total_mrp'),
                func.coalesce(
                    func.sum(Product.current_stock), 0
                ).label('total_bottles'),
                func.count(Product.id).label('total_items'),
            ).filter(
                and_(
                    Product.company_id == company.id,
                    Product.is_active == True,
                    Product.current_stock > 0,
                )
            ).first()

            if stock_result:
                stock_value = float(stock_result.total_cost or 0)
                stock_value_mrp = float(stock_result.total_mrp or 0)
                total_bottles = int(stock_result.total_bottles or 0)
                item_count = int(stock_result.total_items or 0)

        except Exception as e:
            print(f"Stock query failed for company {company.id}: {e}")

        total_stock_value_all += stock_value
        total_stock_mrp_all += stock_value_mrp
        total_bottles_in_stock_all += total_bottles  # ← NEW

        company_stock_list.append(schema.CompanyStockValue(
            company_id=company.id,
            company_name=company_name,
            stock_value=stock_value,
            stock_value_mrp=stock_value_mrp,
            item_count=item_count,
            total_bottles=total_bottles,
        ))

        # ═══════════════════════════════════════════════════
        # ─── NEW: BOTTLES SOLD (Counter + Godown) ─────────
        # ═══════════════════════════════════════════════════
        company_bottles_sold = 0
        try:
            counter_bottles = db.query(
                func.coalesce(func.sum(SaleItem.quantity), 0)
            ).join(Sale, SaleItem.sale_id == Sale.id).filter(
                and_(
                    Sale.company_id == company.id,
                    Sale.created_at.between(start_datetime, end_datetime)
                )
            ).scalar() or 0

            godown_bottles = db.query(
                func.coalesce(func.sum(GodownSaleItem.quantity), 0)
            ).join(GodownSale, GodownSaleItem.sale_id == GodownSale.id).filter(
                and_(
                    GodownSale.company_id == company.id,
                    GodownSale.created_at.between(start_datetime, end_datetime)
                )
            ).scalar() or 0

            company_bottles_sold = int(counter_bottles) + int(godown_bottles)
        except Exception as e:
            print(f"Bottles sold query failed for company {company.id}: {e}")

        total_bottles_sold_all += company_bottles_sold  # ← NEW

        # ═══════════════════════════════════════════════════
        # ─── NEW: BOTTLES PURCHASED ────────────────────────
        # ═══════════════════════════════════════════════════
        company_bottles_purchased = 0
        try:
            company_bottles_purchased = int(
                db.query(
                    func.coalesce(func.sum(PurchaseItem.total_bottles), 0)
                ).join(Purchase, PurchaseItem.purchase_id == Purchase.id).filter(
                    and_(
                        Purchase.company_id == company.id,
                        Purchase.created_at.between(start_datetime, end_datetime)
                    )
                ).scalar() or 0
            )
        except Exception as e:
            print(f"Bottles purchased query failed for company {company.id}: {e}")

        total_bottles_purchased_all += company_bottles_purchased  # ← NEW

    # ─── STATS ───
    stats = schema.OperationsStats(
        total_stores=len(companies),
        total_employees=total_employees_all,
        present_today=present_period_all,
        cash_in_hand=total_sales_all - total_expenses_all,
        total_stock_value=total_stock_value_all,
        total_stock_value_mrp=total_stock_mrp_all,
        total_bottles_in_stock=total_bottles_in_stock_all,      # ← NEW
        total_bottles_sold=total_bottles_sold_all,               # ← NEW
        total_bottles_purchased=total_bottles_purchased_all,     # ← NEW
    )

    # ─── ATTENDANCE LIST ───
    today_attendance_db = []
    try:
        today_attendance_db = db.query(Attendance).filter(
            Attendance.date.between(start_date_str, end_date_str)
        ).limit(20).all()
    except Exception as e:
        print(f"Attendance query failed: {e}")

    attendance_records = []
    for att in today_attendance_db:
        emp_id = getattr(att, 'employee_id', None)
        emp_name = "Unknown"
        store_name = "Unknown"

        if emp_id:
            emp = db.query(Employee).filter(Employee.id == emp_id).first()
            if emp:
                first = getattr(emp, 'first_name', '')
                last = getattr(emp, 'last_name', '')
                emp_name = f"{first} {last}".strip()

                emp_company_id = getattr(emp, 'company_id', None)
                if emp_company_id:
                    comp = db.query(Company).filter(Company.id == emp_company_id).first()
                    if comp:
                        store_name = getattr(
                            comp, 'company_name',
                            getattr(comp, 'name', f"Store {comp.id}")
                        )

        if store_name == "Unknown" and hasattr(att, 'company_id'):
            comp = db.query(Company).filter(Company.id == att.company_id).first()
            if comp:
                store_name = getattr(
                    comp, 'company_name',
                    getattr(comp, 'name', f"Store {comp.id}")
                )

        checkin_val = getattr(att, 'check_in', getattr(att, 'checkin', '--'))
        status_val = getattr(att, 'status', 'UNKNOWN')

        attendance_records.append(schema.AttendanceRecord(
            emp=emp_name,
            store=store_name,
            checkin=str(checkin_val) if checkin_val else "--",
            status=status_val
        ))

    # ─── EXPENSES BREAKDOWN ───
    monthly_expenses_db = db.query(
        ExpenseCategory.name.label('category'),
        func.coalesce(func.sum(Expense.amount), 0).label('total_amount')
    ).join(
        ExpenseCategory,
        Expense.category_id == ExpenseCategory.id
    ).filter(
        Expense.expense_date.between(start_date, end_date)
    ).group_by(ExpenseCategory.name).all()

    monthly_expenses = [
        schema.ExpenseCategoryBreakdown(
            category=row.category or 'OTHER',
            total_amount=float(row.total_amount)
        )
        for row in monthly_expenses_db
    ]

    # ─── PAYROLL SUMMARY ───
    def get_expense_by_category(category_name):
        for row in monthly_expenses:
            if row.category.upper() == category_name.upper():
                return row.total_amount
        return 0.0

    total_salary = get_expense_by_category("Salary")
    overtime = get_expense_by_category("Overtime")
    incentive = get_expense_by_category("Incentive")

    payroll_summary = schema.PayrollSummary(
        total_employees=total_employees_all,
        total_salary=total_salary,
        overtime=overtime,
        incentive=incentive,
        net_payroll=total_salary + overtime + incentive
    )

    return schema.OperationsDashboardResponse(
        stats=stats,
        stores=store_performances,
        attendance=attendance_records,
        monthly_expenses=monthly_expenses,
        payroll_summary=payroll_summary,
        company_stock=company_stock_list,
    )