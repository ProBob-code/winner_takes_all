from __future__ import annotations

import os
from pathlib import Path
from tempfile import gettempdir

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import sessionmaker

try:
    from sqlalchemy_cloudflare_d1 import create_engine_from_binding
except ImportError:
    create_engine_from_binding = None

from .models import Base


DEFAULT_SQLITE_PATH = Path(__file__).parent.parent.parent / "data" / "wta.db"
DEFAULT_DATABASE_URL = f"sqlite:///{DEFAULT_SQLITE_PATH.absolute().as_posix()}"


def normalize_database_url(database_url: str | None = None) -> str:
    url = (database_url or os.getenv("DATABASE_URL") or DEFAULT_DATABASE_URL).strip()

    if url.startswith("postgres://"):
        return url.replace("postgres://", "postgresql+psycopg://", 1)

    if url.startswith("postgresql://") and "+psycopg" not in url:
        return url.replace("postgresql://", "postgresql+psycopg://", 1)

    if url.startswith("d1://") or url.startswith("cloudflare_d1://"):
        # Ensure it uses the cloudflare_d1 protocol for the dialect
        if url.startswith("d1://"):
            return url.replace("d1://", "cloudflare_d1://", 1)
        return url

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


def build_d1_session_factory(d1_binding) -> sessionmaker:
    if not create_engine_from_binding:
        raise ImportError("sqlalchemy-cloudflare-d1 must be installed to use D1 bindings")
    engine = create_engine_from_binding(d1_binding)
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)
