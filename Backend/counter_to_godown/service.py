from sqlalchemy.orm import Session
from .model import CounterToGodownTransfer, CounterToGodownTransferItem
from inventory.model import Product


def get_transfers(
    db: Session, 
    company_id: int | None = None, 
    skip: int = 0, 
    limit: int = 100
):
    query = db.query(CounterToGodownTransfer)
    
    if company_id is not None:
        query = query.filter(CounterToGodownTransfer.company_id == company_id)
        
    return query.order_by(CounterToGodownTransfer.created_at.desc()).offset(skip).limit(limit).all()


def create_transfer(db: Session, transfer_data):
    items_data = transfer_data.items
    transfer_dict = transfer_data.model_dump(exclude={"items"})
    
    db_transfer = CounterToGodownTransfer(**transfer_dict)
    db.add(db_transfer)
    db.flush()
    
    for item_data in items_data:
        item_dict = item_data.model_dump()
        
        # Inherit company_id from parent transfer
        item_dict["company_id"] = db_transfer.company_id
        
        db_item = CounterToGodownTransferItem(**item_dict, transfer_id=db_transfer.id)
        db.add(db_item)
        
        product = db.query(Product).filter(Product.id == item_dict['product_id']).first()
        if product:
            # ─── REVERSE LOGIC: Counter → Godown ───
            if (product.counter_stock or 0) < item_dict['quantity']:
                raise ValueError(f"Not enough counter stock for {product.name}. Available: {product.counter_stock or 0}")
            
            # Subtract from counter
            product.counter_stock = (product.counter_stock or 0) - item_dict['quantity']
            
            # Add to godown
            product.godown_stock = (product.godown_stock or 0) + item_dict['quantity']
            
            # Update total current stock
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
            
            db.add(product)
            
    db.commit()
    db.refresh(db_transfer)
    return db_transfer