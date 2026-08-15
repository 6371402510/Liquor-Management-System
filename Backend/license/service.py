from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
import base64, secrets
from sqlalchemy.orm import Session

from .model import License


# ═══════════════════════════════════════════════════════════
# Supported license durations
# ═══════════════════════════════════════════════════════════
DAY_OPTIONS = {15, 30}
MONTH_OPTIONS = {3, 6, 12, 24, 36}


def generate_license_key(duration: int, duration_type: str = 'months') -> str:
    """
    Generate a license key for a given duration.
    
    Usage:
        generate_license_key(15, 'days')   → 'A1B2C3-D4E5F6-MTU'
        generate_license_key(30, 'days')   → 'A1B2C3-D4E5F6-MZ A'
        generate_license_key(3, 'months')  → 'A1B2C3-D4E5F6-MW'
        generate_license_key(12, 'months') → 'A1B2C3-D4E5F6-MTI'
    """
    if duration_type == 'days' and duration not in DAY_OPTIONS:
        raise ValueError(f"Invalid day duration. Allowed: {DAY_OPTIONS}")
    if duration_type == 'months' and duration not in MONTH_OPTIONS:
        raise ValueError(f"Invalid month duration. Allowed: {MONTH_OPTIONS}")

    value_str = str(duration)
    encoded = base64.urlsafe_b64encode(value_str.encode()).decode().rstrip('=')
    random_part = secrets.token_hex(6).upper()

    key = f"{random_part[:6]}-{random_part[6:]}-{encoded.upper()}"
    return key


def initialize_license(db: Session):
    """
    Creates a 7-day trial license only if no license exists.
    Called automatically after customer registration.
    """
    existing_license = db.query(License).first()

    if existing_license:
        raise ValueError("License already initialized")

    trial_license = License(
        token=f"TRIAL-{secrets.token_hex(4).upper()}",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
        is_active=True,
    )

    db.add(trial_license)
    db.commit()
    db.refresh(trial_license)

    return trial_license


def get_active_license(db: Session):
    """
    Returns the currently active license.
    """
    return (
        db.query(License)
        .filter(License.is_active == True)
        .first()
    )


def activate_license(db: Session, license_key: str):
    """
    Activate a license.
    
    Supported durations:
      Days:   15, 30
      Months: 3, 6, 12, 24, 36
    """
    days = None
    months = None

    for size in (4, 3, 2):
        try:
            encoded = license_key[-size:]
            encoded += "=" * (-len(encoded) % 4)
            value = int(base64.urlsafe_b64decode(encoded).decode())

            # Check day options FIRST (before month options)
            # to avoid 30 being skipped if it ever conflicted
            if value in DAY_OPTIONS:
                days = value
                break
            elif value in MONTH_OPTIONS:
                months = value
                break
        except Exception:
            continue

    if days is None and months is None:
        raise ValueError("Invalid license key")

    start_date = date.today()

    if days:
        end_date = start_date + timedelta(days=days)
    else:
        end_date = start_date + relativedelta(months=months)

    # Deactivate any existing active license
    active_license = (
        db.query(License)
        .filter(License.is_active == True)
        .first()
    )

    if active_license:
        active_license.is_active = False

    new_license = License(
        token=license_key,
        start_date=start_date,
        end_date=end_date,
        is_active=True,
    )

    db.add(new_license)
    db.commit()
    db.refresh(new_license)

    return new_license