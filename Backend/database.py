# from sqlalchemy import create_engine
# from sqlalchemy.ext.declarative import declarative_base
# from sqlalchemy.orm import sessionmaker
# from dotenv import load_dotenv
# import os

# load_dotenv()

# DATABASE_URL = os.getenv("DATABASE_URL")

# engine = create_engine(DATABASE_URL)

# SessionLocal = sessionmaker(
#     autocommit=False,
#     autoflush=False,
#     bind=engine
# )

# Base = declarative_base()

# def get_db():
#     db = SessionLocal()
#     try:
#         yield db
#     finally:
#         db.close()

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# ✅ FIX: Use the DB_DIR passed from main.py, fallback to current dir if not found
# Remove all os.getenv("DATABASE_URL") and dotenv logic!
DB_DIR = os.environ.get("DB_DIR", os.path.dirname(os.path.abspath(__file__)))

# Ensure the directory exists (safety check)
os.makedirs(DB_DIR, exist_ok=True)

DB_PATH = os.path.join(DB_DIR, "liquor.db")

# Construct the SQLite URL directly
DATABASE_URL = f"sqlite:///{DB_PATH}"

print(f"🌐 Database located at: {DB_PATH}") # Helpful for debugging in terminal

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()