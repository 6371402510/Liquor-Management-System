
# import sys
# import os

# if len(sys.argv) > 1:
#     app_data_dir = sys.argv[1]
#     os.makedirs(app_data_dir, exist_ok=True)
#     os.environ["DB_DIR"] = app_data_dir
# else:
#     os.environ["DB_DIR"] = os.path.dirname(os.path.abspath(__file__))




import sys
import os
from pathlib import Path

# def get_db_dir():
#     """Parse --db-dir from args, otherwise default to script directory."""
#     for i, arg in enumerate(sys.argv):
#         if arg == "--db-dir" and i + 1 < len(sys.argv):
#             return sys.argv[i + 1]
#         if arg.startswith("--db-dir="):
#             return arg.split("=", 1)[1]
#     return os.path.dirname(os.path.abspath(__file__))

# app_data_dir = get_db_dir()
# os.makedirs(app_data_dir, exist_ok=True)
# os.environ["DB_DIR"] = app_data_dir


from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import Base, engine

from auth.router import router as auth_router
from company.router import router as company_router
from inventory.router import router as inventory_router
from supplier.router import router as supplier_router
from purchases.router import router as purchases_router
from stock_transfer.router import router as stock_transfer_router
from counter_to_godown.router import router as counter_to_godown_router
from employee.router import router as employee_router
from sales_counter.router import router as sales_counter_router
from sales_godown.router import router as sales_godown_router
from expenses.router import expense_router, category_router
from employee_attendance.router import router as attendance_router
from dashboard.router import router as dashboard_router
from admin_dashboard.router import router as admin_dashboard_router
from damage.router import router as damage_router
from license.router import router as license_router
from cash_summary.router import router as cash_summary_router

from mgr_tracking.router import router as mgr_tracking_router  # ← NEW

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Liquor Desktop System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# routers
app.include_router(auth_router, prefix="/api")
app.include_router(company_router, prefix="/api")
app.include_router(inventory_router, prefix="/api")
app.include_router(supplier_router, prefix="/api")
app.include_router(purchases_router, prefix="/api")
app.include_router(stock_transfer_router, prefix="/api")
app.include_router(employee_router, prefix="/api")
app.include_router(sales_counter_router, prefix="/api")
app.include_router(sales_godown_router, prefix="/api")
app.include_router(expense_router, prefix="/api")
app.include_router(category_router, prefix="/api")
app.include_router(attendance_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(admin_dashboard_router, prefix="/api")
app.include_router(counter_to_godown_router, prefix="/api")
app.include_router(damage_router, prefix="/api")
app.include_router(license_router, prefix="/api")
app.include_router(cash_summary_router, prefix="/api")

app.include_router(mgr_tracking_router, prefix="/api")  # ← NEW



# ─── ENSURE UPLOAD DIRECTORY EXISTS ───
UPLOAD_DIR = Path("uploads/damages")
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

# ─── SERVE UPLOADS AS STATIC FILES ───
app.mount("/api/uploads", StaticFiles(directory="uploads"), name="uploads")

# @app.get("/")
# async def root():
#     return FileResponse("../frontend/dist/index.html")

# @app.get("/{path:path}")
# async def spa(path: str):
#     return FileResponse("../frontend/dist/index.html")

@app.get("/")
def root():
    return {
        "app":"Liquor Desktop",
        "status":"running"
    }

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8000
    )