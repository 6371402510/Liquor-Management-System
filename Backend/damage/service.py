from sqlalchemy.orm import Session
from damage.model import Damage
from damage.schema import DamageCreate, DamageUpdate
from inventory.model import Product  # ← ADD THIS


def get_damages(db: Session, company_id: int = None, skip: int = 0, limit: int = 1000):
    query = db.query(Damage).filter(Damage.is_active == True)
    if company_id is not None:
        query = query.filter(Damage.company_id == company_id)
    return query.order_by(Damage.created_at.desc()).offset(skip).limit(limit).all()


def get_damage(db: Session, damage_id: int):
    return db.query(Damage).filter(Damage.id == damage_id).first()


def create_damage(db: Session, damage_data: DamageCreate):
    damage_dict = damage_data.model_dump(by_alias=False)
    db_damage = Damage(**damage_dict)
    
    db.add(db_damage)
    db.flush()

    # ═══════════════════════════════════════════════════════════════
    # NEW: Deduct stock from products table & increment damage_stock
    # ═══════════════════════════════════════════════════════════════
    if damage_data.product_id:
        product = db.query(Product).filter(Product.id == damage_data.product_id).first()
        if product:
            source = damage_data.damage_source or 'COUNTER'
            qty = damage_data.quantity

            # Deduct from the correct stock
            if source == 'COUNTER':
                if (product.counter_stock or 0) < qty:
                    raise ValueError(
                        f"Insufficient counter stock for {product.name}. "
                        f"Available: {product.counter_stock}, Requested: {qty}"
                    )
                product.counter_stock -= qty
            elif source == 'GODOWN':
                if (product.godown_stock or 0) < qty:
                    raise ValueError(
                        f"Insufficient godown stock for {product.name}. "
                        f"Available: {product.godown_stock}, Requested: {qty}"
                    )
                product.godown_stock -= qty

            # Increment damage stock
            product.damage_stock = (product.damage_stock or 0) + qty

            # Recalculate current stock
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)

            db.add(product)

    db.commit()
    db.refresh(db_damage)
    return db_damage


def update_damage(db: Session, damage_id: int, damage_data: DamageUpdate):
    db_damage = get_damage(db, damage_id)
    if not db_damage:
        return None

    update_data = damage_data.model_dump(exclude_unset=True, by_alias=False)

    # ═══════════════════════════════════════════════════════════════
    # NEW: Handle stock adjustment if quantity or source changed
    # ═══════════════════════════════════════════════════════════════
    old_qty = db_damage.quantity
    old_source = db_damage.damage_source or 'COUNTER'
    new_qty = update_data.get('quantity', old_qty)
    new_source = update_data.get('damage_source', old_source)

    qty_changed = old_qty != new_qty
    source_changed = old_source != new_source

    if (qty_changed or source_changed) and db_damage.product_id:
        product = db.query(Product).filter(Product.id == db_damage.product_id).first()
        if product:
            # Step 1: REVERT old damage
            if old_source == 'COUNTER':
                product.counter_stock = (product.counter_stock or 0) + old_qty
            elif old_source == 'GODOWN':
                product.godown_stock = (product.godown_stock or 0) + old_qty
            product.damage_stock = max(0, (product.damage_stock or 0) - old_qty)

            # Step 2: APPLY new damage
            if new_source == 'COUNTER':
                if (product.counter_stock or 0) < new_qty:
                    raise ValueError(
                        f"Insufficient counter stock for {product.name}. "
                        f"Available: {product.counter_stock}, Requested: {new_qty}"
                    )
                product.counter_stock -= new_qty
            elif new_source == 'GODOWN':
                if (product.godown_stock or 0) < new_qty:
                    raise ValueError(
                        f"Insufficient godown stock for {product.name}. "
                        f"Available: {product.godown_stock}, Requested: {new_qty}"
                    )
                product.godown_stock -= new_qty

            product.damage_stock = (product.damage_stock or 0) + new_qty
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
            db.add(product)

    for key, value in update_data.items():
        setattr(db_damage, key, value)

    db.commit()
    db.refresh(db_damage)
    return db_damage


def soft_delete_damage(db: Session, damage_id: int):
    db_damage = get_damage(db, damage_id)
    if not db_damage:
        return False

    # ═══════════════════════════════════════════════════════════════
    # NEW: Restore stock when soft-deleting a damage record
    # ═══════════════════════════════════════════════════════════════
    if db_damage.product_id:
        product = db.query(Product).filter(Product.id == db_damage.product_id).first()
        if product:
            source = db_damage.damage_source or 'COUNTER'
            qty = db_damage.quantity

            # Restore stock to source
            if source == 'COUNTER':
                product.counter_stock = (product.counter_stock or 0) + qty
            elif source == 'GODOWN':
                product.godown_stock = (product.godown_stock or 0) + qty

            # Reduce damage stock
            product.damage_stock = max(0, (product.damage_stock or 0) - qty)

            # Recalculate current stock
            product.current_stock = (product.godown_stock or 0) + (product.counter_stock or 0)
            db.add(product)

    db_damage.is_active = False
    db.commit()
    return True