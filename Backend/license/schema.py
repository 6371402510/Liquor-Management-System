from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class LicenseActivate(BaseModel):
    token: str


class LicenseResponse(BaseModel):
    id: int
    token: str
    start_date: date
    end_date: date
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]

    model_config = ConfigDict(from_attributes=True)