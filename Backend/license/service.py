from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
import base64, secrets
from sqlalchemy.orm import Session

from .model import License


def initialize_license(db: Session):
    """
    Creates a 15-day trial license only if no license exists.
    Called automatically after customer registration.
    """

    existing_license = db.query(License).first()

    if existing_license:
        raise ValueError("License already initialized")

    trial_license = License(
        token=f"TRIAL-{secrets.token_hex(4).upper()}",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=15),
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

    Responsibilities:
    1. Validate the license key.
    2. Decode its validity.
    3. Mark current license inactive.
    4. Create a new active license.
    """

    try:
        # Decode months from the key
        months = None

        for size in (4, 3, 2):
            try:
                encoded = license_key[-size:]
                encoded += "=" * (-len(encoded) % 4)

                value = int(base64.urlsafe_b64decode(encoded).decode())

                if value in (3, 6, 12, 24, 36):
                    months = value
                    break
            except Exception:
                continue

        if months is None:
            raise ValueError("Invalid license key")

        # Dates
        start_date = date.today()
        end_date = start_date + relativedelta(months=months)

        # Deactivate existing active license
        active_license = (
            db.query(License)
            .filter(License.is_active == True)
            .first()
        )

        if active_license:
            active_license.is_active = False

        # Create new license
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

    except Exception as e:
        db.rollback()
        raise Exception(f"License activation failed: {str(e)}")