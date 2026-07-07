from fastapi import APIRouter, Depends, HTTPException, status,Form, File, UploadFile
from sqlalchemy.orm import Session
from typing import List,Optional
import os                # <--- ADD THIS
import uuid  

from database import get_db
from .schema import DamageCreate, DamageUpdate, DamageResponse
from .service import (
    get_damages, 
    get_damage, 
    create_damage, 
    update_damage, 
    soft_delete_damage
)

router = APIRouter(
    prefix="/damages",
    tags=["Inventory / Damages"]
    
)


# Directory to save images (create this folder in your project root)
UPLOAD_DIR = "uploads/damages"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# =========================================================
# STANDARD CRUD ROUTES
# =========================================================

@router.get("/", response_model=List[DamageResponse])
def list_damages(
    company_id: int | None = None,
    skip: int = 0, 
    limit: int = 1000, 
    db: Session = Depends(get_db)
):
    """Get all active damage records, optionally filtered by company_id"""
    return get_damages(db, company_id=company_id, skip=skip, limit=limit)


@router.get("/{damage_id}", response_model=DamageResponse)
def read_damage(damage_id: int, db: Session = Depends(get_db)):
    """Get a single damage record by ID"""
    damage = get_damage(db, damage_id)
    if not damage:
        raise HTTPException(status_code=404, detail="Damage record not found")
    return damage


@router.post("/", response_model=DamageResponse, status_code=status.HTTP_201_CREATED)
async def create_new_damage(
    # Accept standard fields as Form data
    company_id: Optional[int] = Form(None),
    product_id: Optional[int] = Form(None),
    product_name: str = Form(...),
    brand: Optional[str] = Form(None),
    category: Optional[str] = Form(None),
    bottle_size: Optional[str] = Form(None),
    quantity: int = Form(...),
    reason: str = Form(...),
    notes: Optional[str] = Form(None),
    damage_date: Optional[str] = Form(None),
    recorded_by: Optional[int] = Form(None),
    # Accept the image file
    image: Optional[UploadFile] = File(None),
    db: Session = Depends(get_db)
):
    """Create a new damage record with optional image upload"""
    image_url = None
    
    # Handle image saving
    if image and image.filename:
        # Generate a unique filename to prevent overwrites
        file_extension = image.filename.split(".")[-1]
        unique_filename = f"{uuid.uuid4()}.{file_extension}"
        file_path = os.path.join(UPLOAD_DIR, unique_filename)
        
        # Read and save the file
        with open(file_path, "wb") as buffer:
            content = await image.read()
            buffer.write(content)
            
        # Store the relative path to serve it later
        image_url = f"/uploads/damages/{unique_filename}"

    # Map form data to Pydantic model
    damage_data = DamageCreate(
        company_id=company_id,
        product_id=product_id,
        product_name=product_name,
        brand=brand,
        category=category,
        bottle_size=bottle_size,
        quantity=quantity,
        reason=reason,
        notes=notes,
        damage_date=damage_date,
        recorded_by=recorded_by,
        image_url=image_url
    )
    
    return create_damage(db, damage_data)



@router.put("/{damage_id}", response_model=DamageResponse)
def update_existing_damage(damage_id: int, damage_data: DamageUpdate, db: Session = Depends(get_db)):
    """Update a damage record"""
    damage = update_damage(db, damage_id, damage_data)
    if not damage:
        raise HTTPException(status_code=404, detail="Damage record not found")
    return damage


@router.delete("/{damage_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_damage(damage_id: int, db: Session = Depends(get_db)):
    """Soft delete a damage record"""
    success = soft_delete_damage(db, damage_id)
    if not success:
        raise HTTPException(status_code=404, detail="Damage record not found")
    return