from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from sales_counter.model import Sale
from sales_godown.model import GodownSale
from expenses.model import Expense


router = APIRouter(
    prefix="/cash",
    tags=["Cash Summary"],
)


@router.get("/summary")
def get_cash_summary(
    company_id: int = Query(...),
    selected_date: date = Query(...),
    db: Session = Depends(get_db),
):
    start_datetime = datetime.combine(
        selected_date,
        time.min,
    )

    previous_counter_cash = db.query(
        func.coalesce(
            func.sum(Sale.total_amount),
            0
        )
    ).filter(
        Sale.company_id == company_id,
        Sale.payment_mode == "CASH",
        Sale.created_at < start_datetime,
    ).scalar() or 0

    previous_godown_cash = db.query(
        func.coalesce(
            func.sum(GodownSale.total_amount),
            0
        )
    ).filter(
        GodownSale.company_id == company_id,
        GodownSale.payment_mode == "CASH",
        GodownSale.created_at < start_datetime,
    ).scalar() or 0

    previous_cash_expenses = db.query(
        func.coalesce(
            func.sum(Expense.amount),
            0
        )
    ).filter(
        Expense.company_id == company_id,
        Expense.payment_method == "CASH",
        Expense.expense_date < selected_date,
    ).scalar() or 0

    opening_balance = (
        float(previous_counter_cash)
        + float(previous_godown_cash)
        - float(previous_cash_expenses)
    )

    return {
        "company_id": company_id,
        "selected_date": selected_date,
        "previous_counter_cash": float(previous_counter_cash),
        "previous_godown_cash": float(previous_godown_cash),
        "previous_cash_expenses": float(previous_cash_expenses),
        "opening_balance": opening_balance,
    }