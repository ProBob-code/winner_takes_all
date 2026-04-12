from __future__ import annotations

import os
from pathlib import Path
from tempfile import gettempdir

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

from .models import Base


DEFAULT_SQLITE_PATH = Path(__file__).parent.parent.parent / "data" / "wta.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.absolute().as_posix()}"


def normalize_database_url(database_url: str | None = None) -> str:
    url = (database_url or os.getenv("DATABASE_URL") or DEFAULT_DATABASE_URL).strip()

    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)

    if url.startswith("postgresql://") and "+psycopg" not in url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)

    return url


def build_engine(database_url: str | None = None) -> Engine:
    normalized = normalize_database_url(database_url)
    options: dict = {"future": True}

    if normalized.startswith("sqlite"):
        if normalized != "sqlite:///:memory:":
            database_path = normalized.replace("sqlite:///", "", 1)
            Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        options["connect_args"] = {"check_same_thread": False}

    return create_engine(normalized, **options)


def build_session_factory(database_url: str | None = None) -> sessionmaker:
    engine = build_engine(database_url)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)
