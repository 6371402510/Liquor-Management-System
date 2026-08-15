from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from pathlib import Path
load_dotenv()

DATABASE_TYPE = os.getenv("DATABASE_TYPE", "sqlite").lower()    

if DATABASE_TYPE == "sqlite":
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
    
elif DATABASE_TYPE == "postgresql":

    DATABASE_URL = os.getenv("DATABASE_URL")

    if not DATABASE_URL:
        raise RuntimeError(
            "DATABASE_URL environment variable is required "
            "when DATABASE_TYPE=postgresql"
        )

    print("Database: PostgreSQL")

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
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