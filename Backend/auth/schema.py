from pydantic import BaseModel, EmailStr
from typing import Literal, Optional, List

class LoginSchema(BaseModel):
    email: EmailStr
    password: str

class RegisterSchema(BaseModel):
    name: str
    email: EmailStr
    password: str
    # Public signup is always ADMIN. This field is used when Admin creates users internally.
    role: Optional[Literal["ADMIN", "MANAGER", "SALESMAN"]] = "ADMIN"
    company_id: Optional[int] = None

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str
    company_id: Optional[int] = None
    is_active: bool = True  # <-- ADDED THIS

    class Config:
        from_attributes = True


class UpdateUserSchema(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = None  # If empty, password won't change
    role: Optional[Literal["MANAGER", "SALESMAN"]] = None
    company_id: Optional[int] = None
    is_active: Optional[bool] = None