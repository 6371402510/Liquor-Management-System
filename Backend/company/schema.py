from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from typing import Optional

class CompanyBase(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    company_name: str
    owner_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    establishment_year: Optional[str] = None
    
    excise_license_no: Optional[str] = None 
    trade_license_no: Optional[str] = None  # Added trade license field
    excise_license_expiry: Optional[str] = None
    excise_zone: Optional[str] = None
    gstin:Optional[str] = None
    pan: Optional[str] = None
    mger_targeted_value: float = 0.0
    
    operating_hours: Optional[str] = "10:00 AM - 10:30 PM"
    dry_days_policy: Optional[str] = "Closed on National Holidays & Election Days as per Govt. norms"
    
    default_vat: float = 18.0
    default_cess: float = 0.0
    default_special: float = 0.0
    default_tcs: float = 1.0
    
    # VOLUME FIELDS ARE COMPLETELY REMOVED HERE

class CompanyCreate(CompanyBase):
    pass

class CompanyUpdate(CompanyBase):
    company_name: Optional[str] = None
    owner_name: Optional[str] = None
    excise_license_no: Optional[str] = None
    trade_license_no: Optional[str] = None  # Added trade license field
    gstin: Optional[str] = None
    mger_targeted_value: Optional[float] = None

class CompanyResponse(CompanyBase):
    id: int
    owner_id: Optional[int] = None
    
    class Config:
        from_attributes = True