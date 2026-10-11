from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from .schema import ProductCreate, ProductUpdate, ProductResponse,  BulkProductCreate

from .service import (
    get_products, 
    get_product, 
    create_product, 
    update_product, 
    soft_delete_product,
    update_product_everywhere,
)
from .model import Product

router = APIRouter(
    prefix="/products",
    tags=["Inventory / Products"]
)

# =========================================================
# SEARCH ROUTE (Must be before /{product_id} to work!)
# =========================================================
@router.get("/search/", response_model=List[ProductResponse])
def search_products(
    q: str, 
    company_id: int | None = None,  # ← ADD THIS
    db: Session = Depends(get_db)
):
    """Search products by name, barcode, or item code"""
    query = db.query(Product).filter(Product.is_active == True)
    
    # ← ADD THIS FILTER
    if company_id is not None:
        query = query.filter(Product.company_id == company_id)
    
    if q:
        search_term = f"%{q}%"
        query = query.filter(
            (Product.name.ilike(search_term)) | 
            (Product.barcode.ilike(search_term)) |
            (Product.item_code.ilike(search_term))
        )
    return query.limit(10).all()


# =========================================================
# STANDARD CRUD ROUTES
# =========================================================

@router.get("/", response_model=List[ProductResponse])
def list_products(
    company_id: int | None = None,
    skip: int = 0, 
    limit: int = 1000, 
    db: Session = Depends(get_db)
):
    """Get all active products, optionally filtered by company_id"""
    query = db.query(Product).filter(Product.is_active == True)
    
    if company_id is not None:
        query = query.filter(Product.company_id == company_id)
    
    products = query.order_by(Product.name).offset(skip).limit(limit).all()
    return products

@router.get("/{product_id}", response_model=ProductResponse)
def read_product(product_id: int, db: Session = Depends(get_db)):
    """Get a single product by ID"""
    product = get_product(db, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product
@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_new_product(product_data: ProductCreate, db: Session = Depends(get_db)):
    """Create a new product (single company)"""
    try:
        product = create_product(db, product_data)
        return product
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/bulk/", status_code=status.HTTP_201_CREATED)
def create_product_for_all_companies(
    payload: BulkProductCreate,          # ← fixed class name
    db: Session = Depends(get_db),
):
    try:
        results = create_product(
            db,
            payload.product_data,         # ← now matches schema
            target_company_ids=payload.company_ids,
        )
        if isinstance(results, list):
            return {
                "created": len(results),
                "products": [ProductResponse.model_validate(p) for p in results],
            }
        return {
            "created": 1,
            "products": [ProductResponse.model_validate(results)],
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.put("/{product_id}", response_model=ProductResponse)
def update_existing_product(product_id: int, product_data: ProductUpdate, db: Session = Depends(get_db)):
    """Update a product"""
    try:
        product = update_product(db, product_id, product_data)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        return product
    except ValueError as e:
        # Catches duplicate item_code/barcode within the same company on update
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, db: Session = Depends(get_db)):
    """Soft delete a product (marks as inactive)"""
    success = soft_delete_product(db, product_id)
    if not success:
        raise HTTPException(status_code=404, detail="Product not found")
    return


@router.put("/{product_id}/sync", response_model=ProductResponse)
def update_product_across_companies(
    product_id: int,
    product_data: ProductUpdate,
    db: Session = Depends(get_db),
):
    """
    Update a product in the current company AND mirror the purchase-rate /
    MRP / master-data fields to the same product in every other company.
    """
    try:
        product, synced = update_product_everywhere(db, product_id, product_data)
        if not product:
            raise HTTPException(status_code=404, detail="Product not found")
        # Optional: return synced count in a header or restructure response
        return product
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))