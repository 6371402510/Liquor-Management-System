from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from pathlib import Path


def get_app_data_dir():
    if os.name == "nt":  # Windows
        base = os.getenv("APPDATA")
    else:
        base = os.path.expanduser("~/.local/share")

    folder = Path(base) / "LiquorDesktop"

    folder.mkdir(
        parents=True,
        exist_ok=True
    )

    return folder


DB_DIR = get_app_data_dir()

DB_PATH = DB_DIR / "liquor.db"

DATABASE_URL = f"sqlite:///{DB_PATH}"


print("DATABASE:", DB_PATH)


engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False
    }
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