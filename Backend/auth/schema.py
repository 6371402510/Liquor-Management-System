from pydantic import BaseModel, field_validator
from typing import Literal, Optional, List
import re

class LoginSchema(BaseModel):
    phone: str  # Changed from email
    password: str

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        # Remove any spaces or dashes
        phone = re.sub(r'[\s\-]', '', v)
        # Validate Indian phone number (10 digits) or with country code
        if not re.match(r'^(\+91)?[6-9]\d{9}$', phone):
            raise ValueError('Invalid phone number')
        return phone

class RegisterSchema(BaseModel):
    name: str
    phone: str  # Changed from email
    password: str
    # Public signup is always ADMIN. This field is used when Admin creates users internally.
    role: Optional[Literal["ADMIN", "MANAGER", "SALESMAN"]] = "ADMIN"
    company_id: Optional[int] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        phone = re.sub(r'[\s\-]', '', v)
        if not re.match(r'^(\+91)?[6-9]\d{9}$', phone):
            raise ValueError('Invalid phone number')
        return phone

class UserResponse(BaseModel):
    id: int
    name: str
    phone: str  # Changed from email
    role: str
    company_id: Optional[int] = None
    is_active: bool = True

    class Config:
        from_attributes = True


class UpdateUserSchema(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None  # Changed from email
    password: Optional[str] = None
    role: Optional[Literal["MANAGER", "SALESMAN"]] = None
    company_id: Optional[int] = None
    is_active: Optional[bool] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if v is None:
            return v
        phone = re.sub(r'[\s\-]', '', v)
        if not re.match(r'^(\+91)?[6-9]\d{9}$', phone):
            raise ValueError('Invalid phone number')
        return phone