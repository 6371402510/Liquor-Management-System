"""
ONE-TIME MIGRATION: Fix Product.purchase_rate to be per-BOTTLE instead of per-CASE

Run this once:
    python fix_purchase_rates.py

After running, all products will have purchase_rate = rate per bottle,
so that: Stock Value = current_stock × purchase_rate = Total Bottles × Rate Per Bottle
"""

from database import SessionLocal
from inventory.model import Product
from purchases.model import PurchaseItem

def fix_all_rates():
    db = SessionLocal()
    
    try:
        # Get ALL products
        products = db.query(Product).filter(Product.is_active == True).all()
        fixed_count = 0
        skipped_count = 0
        
        for product in products:
            # ─── STRATEGY 1: Find the latest purchase item for this product ───
            latest_item = db.query(PurchaseItem).filter(
                PurchaseItem.product_id == product.id
            ).order_by(PurchaseItem.id.desc()).first()
            
            rate_per_bottle = 0.0
            
            if latest_item:
                # If purchase_rate_per_unit exists and > 0, use it
                if latest_item.purchase_rate_per_unit and latest_item.purchase_rate_per_unit > 0:
                    rate_per_bottle = latest_item.purchase_rate_per_unit
                
                # Otherwise calculate from unit_cost / bottles_per_case
                elif latest_item.unit_cost and latest_item.unit_cost > 0:
                    bpc = product.bottles_per_case or latest_item.bottles_per_case or 0
                    if bpc > 0:
                        rate_per_bottle = latest_item.unit_cost / bpc
                    else:
                        # Can't calculate, skip
                        skipped_count += 1
                        continue
                
                # Otherwise from total_bottles and total_cost
                elif latest_item.total_bottles and latest_item.total_bottles > 0 and latest_item.total_cost and latest_item.total_cost > 0:
                    rate_per_bottle = latest_item.total_cost / latest_item.total_bottles
                
                else:
                    skipped_count += 1
                    continue
            
            else:
                # ─── STRATEGY 2: No purchase history ───
                # If purchase_rate looks like a per-CASE rate (too high for a bottle)
                # and we know bottles_per_case, divide it
                bpc = product.bottles_per_case or 0
                current_rate = product.purchase_rate or 0
                
                if current_rate > 0 and bpc > 0:
                    # Heuristic: If rate > 1000 and bpc > 1, it's likely per-case
                    if current_rate > 1000 and bpc > 1:
                        rate_per_bottle = current_rate / bpc
                    else:
                        # Already looks like per-bottle rate
                        rate_per_bottle = current_rate
                else:
                    skipped_count += 1
                    continue
            
            if rate_per_bottle > 0:
                old_rate = product.purchase_rate
                product.purchase_rate = round(rate_per_bottle, 2)
                product.landing_cost = round(rate_per_bottle, 2)
                fixed_count += 1
                print(f"  ✅ Product #{product.id} '{product.name}': ₹{old_rate} → ₹{product.purchase_rate}/bottle (bpc={product.bottles_per_case})")
        
        db.commit()
        print(f"\n{'='*60}")
        print(f"MIGRATION COMPLETE")
        print(f"  Fixed:   {fixed_count} products")
        print(f"  Skipped: {skipped_count} products (no data to calculate)")
        print(f"{'='*60}")
        
        # ─── VERIFY: Show stock value ───
        from sqlalchemy import func
        result = db.query(
            func.coalesce(func.sum(Product.current_stock * Product.purchase_rate), 0).label('total_cost'),
            func.coalesce(func.sum(Product.current_stock * Product.mrp), 0).label('total_mrp'),
            func.coalesce(func.sum(Product.current_stock), 0).label('total_bottles'),
        ).filter(Product.is_active == True).first()
        
        print(f"\n  Total Bottles:     {int(result.total_bottles or 0):,}")
        print(f"  Stock Value (Cost): ₹{float(result.total_cost or 0):,.2f}")
        print(f"  Stock Value (MRP):  ₹{float(result.total_mrp or 0):,.2f}")
        
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
    finally:
        db.close()


if __name__ == "__main__":
    print("Starting purchase rate migration...")
    print("This will fix Product.purchase_rate to be per-BOTTLE (not per-CASE)")
    print()
    fix_all_rates()