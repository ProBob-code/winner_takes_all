from pathlib import Path
from tempfile import gettempdir
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.main as main_module
from app.db import SQLAlchemyRepository
from app.service import WTAService


@pytest.fixture
def client() -> TestClient:
    db_dir = Path(gettempdir()) / "wta-api-tests"
    db_dir.mkdir(parents=True, exist_ok=True)
    db_path = db_dir / f"wta-test-{uuid4().hex}.db"
    database_url = f"sqlite:///{db_path.as_posix()}"
    main_module.service = WTAService(
        SQLAlchemyRepository(
            database_url=database_url,
            initialize_schema=True,
            seed_defaults=True,
        )
    )
    with TestClient(main_module.app) as test_client:
        yield test_client
    main_module.service.store.engine.dispose()
    if db_path.exists():
        try:
            db_path.unlink()
        except PermissionError:
            pass


def test_health_endpoint_reports_service_readiness(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["service"] == "api"


def test_signup_creates_session_and_profile_can_be_fetched(client: TestClient) -> None:
    signup = client.post(
        "/auth/signup",
        json={"name": "Test Player", "email": "player@example.com", "password": "supersecure123"},
    )
    assert signup.status_code == 200

    profile = client.get("/user/profile")
    assert profile.status_code == 200
    payload = profile.json()
    assert payload["user"]["email"] == "player@example.com"
    assert payload["user"]["walletBalance"] == "25.00"


def test_wallet_and_tournament_join_flow_update_balance(client: TestClient) -> None:
    signup = client.post(
        "/auth/signup",
        json={"name": "Bracket Runner", "email": "runner@example.com", "password": "anothersecure123"},
    )
    assert signup.status_code == 200
    tournaments = client.get("/tournaments")
    assert tournaments.status_code == 200
    paid = next(item for item in tournaments.json()["tournaments"] if item["entryFee"]["amount"] == "10.00")

    join = client.post(f"/tournaments/{paid['id']}/join")
    assert join.status_code == 200
    payload = join.json()
    assert payload["wallet"]["balance"]["amount"] == "15.00"
    assert payload["tournament"]["joinedPlayers"] == 1


def test_refresh_rotates_session_and_profile_stays_available(client: TestClient) -> None:
    signup = client.post(
        "/auth/signup",
        json={"name": "Refresh Runner", "email": "refresh@example.com", "password": "refreshpass123"},
    )
    assert signup.status_code == 200

    refresh = client.post("/auth/refresh")
    assert refresh.status_code == 200

    profile = client.get("/user/profile")
    assert profile.status_code == 200
    assert profile.json()["user"]["email"] == "refresh@example.com"


def test_duplicate_join_is_rejected(client: TestClient) -> None:
    signup = client.post(
        "/auth/signup",
        json={"name": "Repeat Player", "email": "repeat@example.com", "password": "repeatpass123"},
    )
    assert signup.status_code == 200

    tournaments = client.get("/tournaments")
    paid = next(item for item in tournaments.json()["tournaments"] if item["entryFee"]["amount"] == "10.00")

    first_join = client.post(f"/tournaments/{paid['id']}/join")
    assert first_join.status_code == 200

    second_join = client.post(f"/tournaments/{paid['id']}/join")
    assert second_join.status_code == 409
    assert second_join.json()["message"] == "User already joined this tournament"


def test_protected_routes_reject_unauthenticated_requests(client: TestClient) -> None:
    response = client.get("/wallet")
    assert response.status_code == 401
    assert response.json()["ok"] is False
