
# mgr_tracking/service.py
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, and_
from typing import Optional, List

from company.model import Company
from purchases.model import Purchase, PurchaseItem
from dashboard.model import MGRTracking      # ✅ CORRECT — model lives in dashboard
from . import schema


def get_or_create_mgr_tracking(db: Session, company_id: int, target_date: datetime.date) -> MGRTracking:
    """Get or create MGR tracking record for a given month."""
    month_start = datetime(target_date.year, target_date.month, 1).date()
    
    tracking = db.query(MGRTracking).filter(
        MGRTracking.company_id == company_id,
        MGRTracking.month == month_start
    ).first()
    
    if not tracking:
        # Calculate carryover from previous month
        carryover = calculate_carryover(db, company_id, target_date)
        
        company = db.query(Company).filter(Company.id == company_id).first()
        base_target = float(company.mger_targeted_value or 0.0) if company else 0.0
        
        tracking = MGRTracking(
            company_id=company_id,
            month=month_start,
            base_target=base_target,
            carryover_from_previous=carryover,
            total_target=base_target + carryover,
            achieved_mgr=0.0,
            remaining_mgr=base_target + carryover
        )
        db.add(tracking)
        db.commit()
        db.refresh(tracking)
    
    return tracking


def calculate_carryover(db: Session, company_id: int, target_date: datetime.date) -> float:
    """Calculate carryover from previous month. Can be negative (surplus)."""
    current_month_start = datetime(target_date.year, target_date.month, 1).date()
    
    if target_date.month == 1:
        prev_month_start = datetime(target_date.year - 1, 12, 1).date()
        prev_month_end = datetime(target_date.year - 1, 12, 31).date()
    else:
        prev_month_start = datetime(target_date.year, target_date.month - 1, 1).date()
        prev_month_end = current_month_start - timedelta(days=1)
    
    has_previous_activity = db.query(Purchase.id).filter(
        Purchase.company_id == company_id,
        Purchase.created_at >= datetime.combine(prev_month_start, datetime.min.time()),
        Purchase.created_at <= datetime.combine(prev_month_end, datetime.max.time()),
    ).first()
    
    if not has_previous_activity:
        return 0.0
    
    # Check previous tracking record first
    prev_month_start_date = datetime(prev_month_start.year, prev_month_start.month, 1).date()
    prev_tracking = db.query(MGRTracking).filter(
        MGRTracking.company_id == company_id,
        MGRTracking.month == prev_month_start_date
    ).first()
    
    if prev_tracking:
        # remaining_mgr = total_target - achieved
        # Positive = shortfall, Negative = surplus
        return prev_tracking.remaining_mgr  # Don't clamp to 0!
    
    # Fallback: calculate from scratch
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        return 0.0
    
    prev_target = float(company.mger_targeted_value or 0.0)
    prev_achieved = float(
        db.query(func.coalesce(func.sum(PurchaseItem.mger_value), 0))
        .join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(
            Purchase.company_id == company_id,
            Purchase.created_at >= datetime.combine(prev_month_start, datetime.min.time()),
            Purchase.created_at <= datetime.combine(prev_month_end, datetime.max.time()),
        )
        .scalar() or 0
    )
    
    # Return raw difference (can be negative)
    return prev_target - prev_achieved


def update_mgr_achievement(db: Session, company_id: int, target_date: datetime.date) -> MGRTracking:
    tracking = get_or_create_mgr_tracking(db, company_id, target_date)
    
    month_start = datetime(target_date.year, target_date.month, 1)
    today_end = datetime.combine(target_date, datetime.max.time())
    
    achieved = float(
        db.query(func.coalesce(func.sum(PurchaseItem.mger_value), 0))
        .join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(
            Purchase.company_id == company_id,
            Purchase.created_at >= month_start,
            Purchase.created_at <= today_end,
        )
        .scalar() or 0
    )
    
    tracking.achieved_mgr = achieved
    # ✅ Allow negative remaining (surplus carries forward)
    tracking.remaining_mgr = tracking.total_target - achieved  # Don't use max(0, ...)
    tracking.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(tracking)
    return tracking

def get_mgr_report(db: Session, company_id: int, target_date_str: Optional[str] = None) -> schema.MGRReportResponse:
    """Generate comprehensive MGR report."""
    if target_date_str:
        try:
            target_date = datetime.strptime(target_date_str, "%Y-%m-%d").date()
        except ValueError:
            target_date = datetime.now().date()
    else:
        target_date = datetime.now().date()
    
    # Update achievement first
    tracking = update_mgr_achievement(db, company_id, target_date)
    
    # Get company info
    company = db.query(Company).filter(Company.id == company_id).first()
    
    # Calculate monthly stats
    month_start = datetime(target_date.year, target_date.month, 1)
    today_end = datetime.combine(target_date, datetime.max.time())
    
    # Monthly MGR achieved
    month_achieved = float(
        db.query(func.coalesce(func.sum(PurchaseItem.mger_value), 0))
        .join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(
            Purchase.company_id == company_id,
            Purchase.created_at >= month_start,
            Purchase.created_at <= today_end,
        )
        .scalar() or 0
    )
    
    # Total MGR (all time)
    total_achieved = float(
        db.query(func.coalesce(func.sum(PurchaseItem.mger_value), 0))
        .join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(Purchase.company_id == company_id)
        .scalar() or 0
    )
    
    # Calculate percentage
    percentage = (tracking.achieved_mgr / tracking.total_target * 100) if tracking.total_target > 0 else 0
    
    # Days left in month
    if target_date.month == 12:
        month_end = datetime(target_date.year, 12, 31).date()
    else:
        month_end = datetime(target_date.year, target_date.month + 1, 1).date() - timedelta(days=1)
    
    days_left = (month_end - target_date).days
    daily_target_needed = tracking.remaining_mgr / days_left if days_left > 0 else tracking.remaining_mgr
    
    # Monthly history (last 12 months)
    history = []
    for i in range(0, 12):
        target_month = target_date.month - i
    target_year  = target_date.year
    
    while target_month <= 0:
        target_month += 12
        target_year  -= 1
    
    hist_month_start = datetime(target_year, target_month, 1)
    if hist_month_start.month == 12:
        hist_month_end = datetime(target_year + 1, 1, 1) - timedelta(days=1)
    else:
        hist_month_end = datetime(target_year, target_month + 1, 1) - timedelta(days=1)
    
    hist_achieved = float(
        db.query(func.coalesce(func.sum(PurchaseItem.mger_value), 0))
        .join(Purchase, PurchaseItem.purchase_id == Purchase.id)
        .filter(
            Purchase.company_id == company_id,
            Purchase.created_at >= hist_month_start,
            Purchase.created_at <= datetime.combine(hist_month_end, datetime.max.time()),
        )
        .scalar() or 0
    )
    
    hist_tracking = db.query(MGRTracking).filter(
        MGRTracking.company_id == company_id,
        MGRTracking.month == hist_month_start.date()
    ).first()
    
    base_target = float(company.mger_targeted_value or 0.0) if company else 0.0
    carryover = hist_tracking.carryover_from_previous if hist_tracking else 0
    total_target = max(0.0, base_target + carryover)
    
    history.append(schema.MGRMonthlyHistory(
        month=hist_month_start.strftime("%b %Y"),
        base_target=base_target,
        carryover=carryover,
        total_target=total_target,
        achieved=hist_achieved,
        remaining=total_target - hist_achieved,   # ✅ allow negative
        percentage=round((hist_achieved / total_target * 100) if total_target > 0 else 0, 2)
    ))

    
    # Purchase-wise MGR breakdown (current month)
    purchases_with_mgr = db.query(
        Purchase.id,
        Purchase.invoice_number,
        Purchase.billing_date,
        Purchase.supplier_name,
        Purchase.created_at,
        func.coalesce(func.sum(PurchaseItem.mger_value), 0).label('mgr_value')
    ).join(
        PurchaseItem, PurchaseItem.purchase_id == Purchase.id
    ).filter(
        Purchase.company_id == company_id,
        Purchase.created_at >= month_start,
        Purchase.created_at <= today_end,
    ).group_by(
        Purchase.id
    ).order_by(
        Purchase.created_at.desc()
    ).all()
    
    purchase_breakdown = [
        schema.MGRPurchaseBreakdown(
            id=p.id,
            invoice_number=p.invoice_number,
            billing_date=str(p.billing_date) if p.billing_date else None,
            supplier_name=p.supplier_name,
            mgr_value=float(p.mgr_value),
            created_at=p.created_at
        )
        for p in purchases_with_mgr
    ]
    
    # Summary stats
    stats = schema.MGRReportStats(
        base_target=tracking.base_target,
        carryover=tracking.carryover_from_previous,
        total_target=tracking.total_target,
        achieved=tracking.achieved_mgr,
        remaining=tracking.remaining_mgr,
        percentage=round(percentage, 2),
        days_left=days_left,
        daily_target_needed=round(daily_target_needed, 2),
        total_mgr_all_time=total_achieved,
        purchase_count=len(purchase_breakdown)
    )
    
    return schema.MGRReportResponse(
        company_name=company.company_name if company else "Unknown",   # ✅ FIXED
        current_month=target_date.strftime("%B %Y"),
        stats=stats,
        monthly_history=history,
        purchase_breakdown=purchase_breakdown
    )