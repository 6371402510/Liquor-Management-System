from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from typing import List
from datetime import date as date_type
from datetime import datetime
from sqlalchemy import func, and_
from sqlalchemy.orm import joinedload
from typing import Optional

from .model import Purchase, PurchaseItem
from .schema import PurchaseCreate
from inventory.model import Product

# Optional imports used by the dashboard function – keep them if that
# function lives in this same file. Remove if you split it out.
from company.model import Company
from employee.model import Employee
from expenses.model import Expense, ExpenseCategory
from sales_counter.model import Sale, SaleItem
from sales_godown.model import GodownSale, GodownSaleItem
from employee_attendance.model import Attendance

from . import schema


# ─────────────────────────────────────────────────────────────
# HELPER: Convert Pydantic item → dict for PurchaseItem(**dict)
# ─────────────────────────────────────────────────────────────
def _prepare_item_dict(item_data) -> dict:
    """
    Convert a PurchaseItemCreate Pydantic model into a dict
    suitable for creating a PurchaseItem ORM object.
    by_alias=False -> keys match ORM column names
    (product_name, unit_cost, qty_cases, ...).
    """
    return item_data.model_dump(by_alias=False)


# ─────────────────────────────────────────────────────────────
# PURCHASE READ HELPERS
# ─────────────────────────────────────────────────────────────
def get_purchases(db: Session, company_id: int | None = None, skip: int = 0, limit: int = 1000):
    query = db.query(Purchase)
    if company_id is not None:
        query = query.filter(Purchase.company_id == company_id)
    return query.order_by(Purchase.purchase_date.desc()).offset(skip).limit(limit).all()


def get_purchase(db: Session, purchase_id: int):
    return db.query(Purchase).filter(Purchase.id == purchase_id).first()


def get_purchase_items(db: Session, purchase_id: int):
    """
    Return PurchaseItem rows enriched with `short_name`.
    Resolution order:
      1. persisted PurchaseItem.short_name   (if column exists and is set)
      2. Product.short_name for the linked product_id
      3. Product.name fallback
      4. None
    """
    items = (
        db.query(PurchaseItem)
        .filter(PurchaseItem.purchase_id == purchase_id)
        .all()
    )
    if not items:
        return []

    product_ids = list({i.product_id for i in items if i.product_id})
    products = {}
    if product_ids:
        rows = db.query(Product).filter(Product.id.in_(product_ids)).all()
        products = {p.id: p for p in rows}

    for it in items:
        persisted = getattr(it, "short_name", None)
        prod = products.get(it.product_id) if it.product_id else None
        resolved = (
            persisted
            or (prod.short_name if prod else None)
            or (prod.name if prod else None)
        )
        it.short_name = resolved

    return items


# ─────────────────────────────────────────────────────────────
# HELPER: Apply stock to correct location
# ─────────────────────────────────────────────────────────────
def _apply_stock(product, total_bottles, destination, is_add=True):
    """Add or remove stock from counter or godown based on destination."""
    if not product:
        return

    if destination == "COUNTER":
        if is_add:
            product.counter_stock = (product.counter_stock or 0) + total_bottles
        else:
            product.counter_stock = max(0, (product.counter_stock or 0) - total_bottles)
    else:  # GODOWN (default)
        if is_add:
            product.godown_stock = (product.godown_stock or 0) + total_bottles
        else:
            product.godown_stock = max(0, (product.godown_stock or 0) - total_bottles)

    product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)


# ─────────────────────────────────────────────────────────────
# HELPER: Update purchase rate + landing cost on product
# ─────────────────────────────────────────────────────────────
def _update_product_rate(product, item_data, total_bottles, purchase_data=None):
    rate_per_unit = 0.0

    if item_data.purchase_rate_per_unit and item_data.purchase_rate_per_unit > 0:
        rate_per_unit = item_data.purchase_rate_per_unit
    elif item_data.unit_cost and item_data.unit_cost > 0:
        bpc = product.bottles_per_case or item_data.bottles_per_case or 0
        if bpc > 0:
            rate_per_unit = item_data.unit_cost / bpc
    elif total_bottles > 0 and item_data.total_cost and item_data.total_cost > 0:
        rate_per_unit = item_data.total_cost / total_bottles

    if rate_per_unit > 0:
        product.purchase_rate = rate_per_unit

        base = rate_per_unit + (rate_per_unit * 0.35)
        base_with_tcs = base + (base * 0.02)

        if purchase_data:
            handling   = purchase_data.total_handling or 0
            vat_amount = purchase_data.vat_amount or 0
            tcs_amount = purchase_data.tcs_amount or 0
            subtotal   = purchase_data.subtotal or 0

            denominator = vat_amount + tcs_amount + subtotal

            if denominator > 0:
                landing_cost = base_with_tcs + (base_with_tcs * (handling / denominator))
                product.landing_cost = round(landing_cost, 2)
            else:
                product.landing_cost = round(base_with_tcs, 2)
        else:
            product.landing_cost = round(base_with_tcs, 2)


# ─────────────────────────────────────────────────────────────
# HELPER: Total bottles from a purchase item
# ─────────────────────────────────────────────────────────────
def _calc_total_bottles(item):
    total_bottles = item.total_bottles or 0
    if total_bottles == 0 and item.qty_cases > 0:
        total_bottles = item.qty_cases * (item.bottles_per_case or 1)
    return total_bottles


# ─────────────────────────────────────────────────────────────
# CREATE
# ─────────────────────────────────────────────────────────────
def create_purchase(db: Session, purchase_data: PurchaseCreate):
    if check_invoice_number_exists(db, purchase_data.invoice_number):
        raise ValueError(f"Invoice number '{purchase_data.invoice_number}' already exists")

    purchase_dict = purchase_data.model_dump(exclude={"items"}, by_alias=False)

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = purchase_dict.get("billing_date") or date_type.today()
    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

    destination = purchase_dict.get("stock_destination", "GODOWN")

    db_purchase = Purchase(**purchase_dict)

    try:
        db.add(db_purchase)
        db.flush()

        for item_data in purchase_data.items:
            item_dict = _prepare_item_dict(item_data)
            item_dict["purchase_id"] = db_purchase.id
            item_dict["company_id"] = db_purchase.company_id

            db_item = PurchaseItem(**item_dict)
            db.add(db_item)

            product_id = item_data.product_id
            if product_id:
                product = db.query(Product).filter(Product.id == product_id).first()
                if product:
                    total_bottles = _calc_total_bottles(item_data)

                    _apply_stock(product, total_bottles, destination, is_add=True)

                    if (product.opening_stock or 0) == 0:
                        product.opening_stock = total_bottles

                    _update_product_rate(product, item_data, total_bottles, db_purchase)

        db.commit()
        db.refresh(db_purchase)
        return db_purchase

    except IntegrityError:
        db.rollback()
        return None
    except Exception as e:
        db.rollback()
        raise e


# ─────────────────────────────────────────────────────────────
# DELETE
# ─────────────────────────────────────────────────────────────
def delete_purchase(db: Session, purchase_id: int):
    db_purchase = get_purchase(db, purchase_id)
    if not db_purchase:
        return False

    old_destination = db_purchase.stock_destination or "GODOWN"

    items = db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()
    for item in items:
        if item.product_id:
            product = db.query(Product).filter(Product.id == item.product_id).first()
            if product:
                total_bottles = _calc_total_bottles(item)
                _apply_stock(product, total_bottles, old_destination, is_add=False)

    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()
    db.delete(db_purchase)
    db.commit()
    return True


# ─────────────────────────────────────────────────────────────
# UPDATE
# ─────────────────────────────────────────────────────────────
def update_purchase(db: Session, purchase_id: int, purchase_data: PurchaseCreate):
    db_purchase = get_purchase(db, purchase_id)
    if not db_purchase:
        return None

    if check_invoice_number_exists(db, purchase_data.invoice_number, exclude_purchase_id=purchase_id):
        raise ValueError(f"Invoice number '{purchase_data.invoice_number}' already exists")

    old_destination = db_purchase.stock_destination or "GODOWN"

    # STEP 1: reverse old stock
    old_items = db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).all()
    for old_item in old_items:
        if old_item.product_id:
            product = db.query(Product).filter(Product.id == old_item.product_id).first()
            if product:
                total_bottles = _calc_total_bottles(old_item)
                _apply_stock(product, total_bottles, old_destination, is_add=False)

    # STEP 2: delete old items
    db.query(PurchaseItem).filter(PurchaseItem.purchase_id == purchase_id).delete()

    # STEP 3: update header
    purchase_dict = purchase_data.model_dump(exclude={"items"}, by_alias=False)

    if not purchase_dict.get("purchase_date"):
        purchase_dict["purchase_date"] = purchase_dict.get("billing_date") or date_type.today()
    if not purchase_dict.get("billing_date"):
        purchase_dict["billing_date"] = date_type.today()

    new_destination = purchase_dict.get("stock_destination", "GODOWN")

    for key, value in purchase_dict.items():
        setattr(db_purchase, key, value)

    db.flush()

    # STEP 4: recreate items + apply stock
    for item_data in purchase_data.items:
        item_dict = _prepare_item_dict(item_data)
        item_dict["purchase_id"] = db_purchase.id
        item_dict["company_id"] = db_purchase.company_id

        db_item = PurchaseItem(**item_dict)
        db.add(db_item)

        product_id = item_data.product_id
        if product_id:
            product = db.query(Product).filter(Product.id == product_id).first()
            if product:
                total_bottles = _calc_total_bottles(item_data)
                _apply_stock(product, total_bottles, new_destination, is_add=True)
                _update_product_rate(product, item_data, total_bottles, db_purchase)

    try:
        db.commit()
        db.refresh(db_purchase)
        return db_purchase
    except Exception as e:
        db.rollback()
        raise e


# ─────────────────────────────────────────────────────────────
# INVOICE UNIQUENESS
# ─────────────────────────────────────────────────────────────
def check_invoice_number_exists(db: Session, invoice_number: str, exclude_purchase_id: int = None):
    query = db.query(Purchase).filter(Purchase.invoice_number == invoice_number)
    if exclude_purchase_id is not None:
        query = query.filter(Purchase.id != exclude_purchase_id)
    return query.first() is not None


# ─────────────────────────────────────────────────────────────
# LIST WITH ITEMS (for reports)
# ─────────────────────────────────────────────────────────────
def get_purchases_with_items(
    db: Session,
    company_id: int | None = None,
    date_from=None,
    date_to=None,
    skip: int = 0,
    limit: int = 100000,
):
    query = db.query(Purchase).options(joinedload(Purchase.items))

    if company_id is not None:
        query = query.filter(Purchase.company_id == company_id)

    effective_date = func.coalesce(Purchase.billing_date, Purchase.purchase_date)

    if date_from:
        query = query.filter(effective_date >= date_from)
    if date_to:
        query = query.filter(effective_date <= date_to)

    return query.order_by(effective_date.desc()).offset(skip).limit(limit).all()


# ─────────────────────────────────────────────────────────────
# OPERATIONS DASHBOARD
# ─────────────────────────────────────────────────────────────
def get_operations_dashboard_data(
    db: Session,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
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

        # ─── COGS + PROFIT ───
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

        store_vat = store_cogs * 0.35
        store_tcs = (store_cogs + store_vat) * 0.02
        store_profit = store_sales - store_cogs - store_vat - store_tcs - store_expense

        store_performances.append(schema.StorePerformance(
            id=company.id,
            name=company_name,
            sales=store_sales,
            cogs=store_cogs,
            vat=store_vat,
            tcs=store_tcs,
            expense=store_expense,
            profit=store_profit,
            employees=emp_count
        ))

        # ─── STOCK VALUE ───
        stock_value = 0.0
        stock_value_mrp = 0.0
        item_count = 0
        total_bottles = 0

        try:
            stock_result = db.query(
                func.coalesce(func.sum(Product.current_stock * Product.purchase_rate), 0).label('total_cost'),
                func.coalesce(func.sum(Product.current_stock * Product.mrp), 0).label('total_mrp'),
                func.coalesce(func.sum(Product.current_stock), 0).label('total_bottles'),
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
        total_bottles_in_stock_all += total_bottles

        company_stock_list.append(schema.CompanyStockValue(
            company_id=company.id,
            company_name=company_name,
            stock_value=stock_value,
            stock_value_mrp=stock_value_mrp,
            item_count=item_count,
            total_bottles=total_bottles,
        ))

        # ─── BOTTLES SOLD ───
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

        total_bottles_sold_all += company_bottles_sold

        # ─── BOTTLES PURCHASED ───
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

        total_bottles_purchased_all += company_bottles_purchased

    # ─── STATS ───
    stats = schema.OperationsStats(
        total_stores=len(companies),
        total_employees=total_employees_all,
        present_today=present_period_all,
        cash_in_hand=total_sales_all - total_expenses_all,
        total_stock_value=total_stock_value_all,
        total_stock_value_mrp=total_stock_mrp_all,
        total_bottles_in_stock=total_bottles_in_stock_all,
        total_bottles_sold=total_bottles_sold_all,
        total_bottles_purchased=total_bottles_purchased_all,
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