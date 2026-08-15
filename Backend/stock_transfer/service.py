from sqlalchemy.orm import Session
from .model import StockTransfer, StockTransferItem
from inventory.model import Product

def get_transfers(db: Session, company_id: int | None = None, skip: int = 0, limit: int = 100):
    # ─── ADDED COMPANY FILTER ───
    query = db.query(StockTransfer)
    if company_id is not None:
        query = query.filter(StockTransfer.company_id == company_id)
        
    return query.order_by(StockTransfer.created_at.desc()).offset(skip).limit(limit).all()

def create_transfer(db: Session, transfer_data: StockTransfer):
    items_data = transfer_data.items
    transfer_dict = transfer_data.model_dump(exclude={"items"})
    
    db_transfer = StockTransfer(**transfer_dict)
    db.add(db_transfer)
    db.flush()
    
    for item_data in items_data:
        item_dict = item_data.model_dump()
        item_dict["company_id"] = db_transfer.company_id
        
        db_item = StockTransferItem(**item_dict, transfer_id=db_transfer.id)
        db.add(db_item)
        
        # ─── Stock deduction uses item_dict['quantity'] (total bottles) ───
        product = db.query(Product).filter(Product.id == item_dict['product_id']).first()
        if product:
            if (product.godown_stock or 0) < item_dict['quantity']:
                raise ValueError(f"Not enough godown stock for {product.name}")
            
            product.godown_stock = (product.godown_stock or 0) - item_dict['quantity']
            product.counter_stock = (product.counter_stock or 0) + item_dict['quantity']
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
            db.add(product)
            
    db.commit()
    db.refresh(db_transfer)
    return db_transfer