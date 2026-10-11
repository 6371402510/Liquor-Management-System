from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
import base64, secrets
from sqlalchemy.orm import Session

from .model import License


DAY_OPTIONS   = {15, 30}
MONTH_OPTIONS = {3, 6, 12, 24, 36}

# ─── Allowed company limits (None = unlimited) ───
COMPANY_OPTIONS = {1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100}


def _encode(v: int) -> str:
    """Encode a number to base64url, strip padding."""
    return base64.urlsafe_b64encode(str(v).encode()).decode().rstrip('=')


# ─── Pre-compute valid duration encodings ───
VALID_DURATION_ENCODINGS = {}
for _v in DAY_OPTIONS | MONTH_OPTIONS:
    _enc = _encode(_v)
    for _ver in (_enc, _enc.upper()):
        VALID_DURATION_ENCODINGS[_ver] = _v


# ─── Pre-compute valid company-limit encodings ───
VALID_COMPANY_ENCODINGS = {}
for _v in COMPANY_OPTIONS:
    _enc = _encode(_v)
    for _ver in (_enc, _enc.upper()):
        VALID_COMPANY_ENCODINGS[_ver] = _v


def generate_license_key(
    duration: int,
    duration_type: str = 'months',
    max_companies: int | None = None,
) -> str:
    """
    Build a license key.

    duration: 15/30 (days) or 3/6/12/24/36 (months)
    duration_type: 'days' | 'months'
    max_companies: None → unlimited, else must be in COMPANY_OPTIONS
    """
    if duration_type == 'days' and duration not in DAY_OPTIONS:
        raise ValueError(f"Invalid day duration. Allowed: {DAY_OPTIONS}")
    if duration_type == 'months' and duration not in MONTH_OPTIONS:
        raise ValueError(f"Invalid month duration. Allowed: {MONTH_OPTIONS}")
    if max_companies is not None and max_companies not in COMPANY_OPTIONS:
        raise ValueError(f"Invalid company limit. Allowed: {COMPANY_OPTIONS} or None")

    random_part = secrets.token_hex(6).upper()
    duration_enc = _encode(duration)

    if max_companies is None:
        # Old 3-part format — unlimited companies (backward compatible)
        return f"{random_part[:6]}-{random_part[6:]}-{duration_enc}"

    # New 4-part format — includes company limit
    company_enc = _encode(max_companies)
    return f"{random_part[:6]}-{random_part[6:]}-{duration_enc}-{company_enc}"


def initialize_license(db: Session):
    existing = db.query(License).first()
    if existing:
        raise ValueError("License already initialized")

    # Trial: 7 days, up to 1 company
    trial = License(
        token=f"TRIAL-{secrets.token_hex(4).upper()}",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
        is_active=True,
        max_companies=1,
    )
    db.add(trial)
    db.commit()
    db.refresh(trial)
    return trial


def get_active_license(db: Session):
    return db.query(License).filter(License.is_active == True).first()


def activate_license(db: Session, license_key: str):
    raw = license_key.strip().upper()

    # Strip optional VICHAAR- prefix
    if raw.startswith("VICHAAR-"):
        raw = raw[len("VICHAAR-"):]

    parts = raw.split('-')

    if len(parts) == 3:
        # Old format: XXXXXX-XXXXXX-DURATION  (unlimited companies)
        duration_enc = parts[2]
        company_enc  = None
    elif len(parts) == 4:
        # New format: XXXXXX-XXXXXX-DURATION-COMPANIES
        duration_enc = parts[2]
        company_enc  = parts[3]
    else:
        raise ValueError("Invalid license key format")

    # ─── Resolve duration ───
    value = VALID_DURATION_ENCODINGS.get(duration_enc)
    if value is None:
        raise ValueError("Invalid license key")

    days = months = None
    if value in DAY_OPTIONS:
        days = value
    elif value in MONTH_OPTIONS:
        months = value

    # ─── Resolve company limit ───
    if company_enc is None:
        max_companies = None  # old key → unlimited
    else:
        max_companies = VALID_COMPANY_ENCODINGS.get(company_enc)
        if max_companies is None:
            raise ValueError("Invalid license key")

    start_date = date.today()
    end_date = start_date + timedelta(days=days) if days else start_date + relativedelta(months=months)

    # Deactivate previous
    active = db.query(License).filter(License.is_active == True).first()
    if active:
        active.is_active = False

    new_license = License(
        token=raw,
        start_date=start_date,
        end_date=end_date,
        is_active=True,
        max_companies=max_companies,
    )
    db.add(new_license)
    db.commit()
    db.refresh(new_license)
    return new_license