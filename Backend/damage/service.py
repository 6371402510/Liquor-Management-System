from sqlalchemy.orm import Session
from damage.model import Damage  # Adjust import if you put it in a 'damage' folder
from damage.schema import DamageCreate, DamageUpdate


def get_damages(db: Session, company_id: int = None, skip: int = 0, limit: int = 1000):
    query = db.query(Damage).filter(Damage.is_active == True)
    if company_id is not None:
        query = query.filter(Damage.company_id == company_id)
    # Show newest damages first
    return query.order_by(Damage.created_at.desc()).offset(skip).limit(limit).all()


def get_damage(db: Session, damage_id: int):
    return db.query(Damage).filter(Damage.id == damage_id).first()


def create_damage(db: Session, damage_data: DamageCreate):
    damage_dict = damage_data.model_dump(by_alias=False)
    db_damage = Damage(**damage_dict)
    
    db.add(db_damage)
    db.commit()
    db.refresh(db_damage)
    return db_damage


def update_damage(db: Session, damage_id: int, damage_data: DamageUpdate):
    db_damage = get_damage(db, damage_id)
    if not db_damage:
        return None
    
    update_data = damage_data.model_dump(exclude_unset=True, by_alias=False)

    for key, value in update_data.items():
        setattr(db_damage, key, value)
        
    db.commit()
    db.refresh(db_damage)
    return db_damage


def soft_delete_damage(db: Session, damage_id: int):
    db_damage = get_damage(db, damage_id)
    if not db_damage:
        return False
    
    db_damage.is_active = False
    db.commit()
    return True