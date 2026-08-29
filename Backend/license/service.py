from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
import base64, secrets
from sqlalchemy.orm import Session

from .model import License


DAY_OPTIONS = {15, 30}
MONTH_OPTIONS = {3, 6, 12, 24, 36}

# Pre-compute all valid encodings (handles both MzY and MZY)
VALID_ENCODINGS = {}
for _v in DAY_OPTIONS | MONTH_OPTIONS:
    _raw = base64.urlsafe_b64encode(str(_v).encode()).decode()
    _stripped = _raw.rstrip('=')
    for _ver in (_stripped, _raw, _stripped.upper(), _raw.upper()):
        VALID_ENCODINGS[_ver] = _v


def generate_license_key(duration: int, duration_type: str = 'months') -> str:
    if duration_type == 'days' and duration not in DAY_OPTIONS:
        raise ValueError(f"Invalid day duration. Allowed: {DAY_OPTIONS}")
    if duration_type == 'months' and duration not in MONTH_OPTIONS:
        raise ValueError(f"Invalid month duration. Allowed: {MONTH_OPTIONS}")

    value_str = str(duration)
    encoded = base64.urlsafe_b64encode(value_str.encode()).decode().rstrip('=')
    random_part = secrets.token_hex(6).upper()

    key = f"{random_part[:6]}-{random_part[6:]}-{encoded}"
    return key


def initialize_license(db: Session):
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
    return (
        db.query(License)
        .filter(License.is_active == True)
        .first()
    )


def activate_license(db: Session, license_key: str):
    # Strip VICHAAR- prefix if present
    parts = license_key.split('-')
    if len(parts) == 4:
        license_key = '-'.join(parts[1:])

    # Extract encoded part (after last dash)
    encoded_part = license_key.rsplit('-', 1)[-1]

    # Look up in pre-computed valid encodings
    value = VALID_ENCODINGS.get(encoded_part)

    if value is None:
        raise ValueError("Invalid license key")

    days = None
    months = None

    if value in DAY_OPTIONS:
        days = value
    elif value in MONTH_OPTIONS:
        months = value

    start_date = date.today()

    if days:
        end_date = start_date + timedelta(days=days)
    else:
        end_date = start_date + relativedelta(months=months)

    # Deactivate existing
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