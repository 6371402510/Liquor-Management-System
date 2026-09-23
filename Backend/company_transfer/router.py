from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
from . import service, schema

router = APIRouter(
    prefix="/company-transfers",
    tags=["Company Transfers"]
)


@router.get("/", response_model=list[schema.CompanyTransferOut])
def list_transfers(company_id: int | None = None, db: Session = Depends(get_db)):
    transfers = service.get_company_transfers(db, company_id)
    for t in transfers:
        t.items = service.get_company_transfer_items(db, t.id)
    return transfers


@router.get("/{transfer_id}", response_model=schema.CompanyTransferOut)
def get_transfer(transfer_id: int, db: Session = Depends(get_db)):
    t = service.get_company_transfer(db, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    t.items = service.get_company_transfer_items(db, transfer_id)
    return t


@router.get("/{transfer_id}/items", response_model=list[schema.CompanyTransferItemOut])
def get_transfer_items(transfer_id: int, db: Session = Depends(get_db)):
    t = service.get_company_transfer(db, transfer_id)
    if not t:
        raise HTTPException(404, "Transfer not found")
    return service.get_company_transfer_items(db, transfer_id)


@router.post("/", response_model=schema.CompanyTransferOut)
def create_transfer(payload: schema.CompanyTransferCreate, db: Session = Depends(get_db)):
    try:
        t = service.create_company_transfer(db, payload)
        t.items = service.get_company_transfer_items(db, t.id)
        return t
    except ValueError as e:
        raise HTTPException(400, str(e))