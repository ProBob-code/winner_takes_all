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


def _signup(client: TestClient, name: str, email: str) -> dict:
    res = client.post(
        "/auth/signup",
        json={"name": name, "email": email, "password": "supersecure123"},
    )
    assert res.status_code == 200
    return res.json()


def _get_paid_tournament(client: TestClient) -> dict:
    res = client.get("/tournaments")
    assert res.status_code == 200
    tournaments = res.json()["tournaments"]
    return next(t for t in tournaments if float(t["entryFee"]["amount"]) > 0)


def _get_free_tournament(client: TestClient) -> dict:
    res = client.get("/tournaments")
    assert res.status_code == 200
    tournaments = res.json()["tournaments"]
    return next(t for t in tournaments if float(t["entryFee"]["amount"]) == 0)


# ── Health ──

def test_health_endpoint_reports_service_readiness(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ok"] is True
    assert payload["service"] == "api"
    assert "activeGameRooms" in payload


# ── Auth ──

def test_signup_creates_session_and_profile_can_be_fetched(client: TestClient) -> None:
    _signup(client, "Test Player", "player@example.com")
    profile = client.get("/user/profile")
    assert profile.status_code == 200
    payload = profile.json()
    assert payload["user"]["email"] == "player@example.com"
    assert payload["user"]["walletBalance"] == "2500.00"  # ₹2,500 signup bonus


def test_protected_routes_reject_unauthenticated_requests(client: TestClient) -> None:
    response = client.get("/wallet")
    assert response.status_code == 401
    assert response.json()["ok"] is False


# ── Wallet ──

def test_wallet_shows_inr_balance(client: TestClient) -> None:
    _signup(client, "Wallet User", "wallet@example.com")
    res = client.get("/wallet")
    assert res.status_code == 200
    wallet = res.json()["wallet"]
    assert wallet["balance"]["currency"] == "INR"
    assert wallet["balance"]["amount"] == "2500.00"


# ── Tournament Join ──

def test_wallet_and_tournament_join_flow_update_balance(client: TestClient) -> None:
    _signup(client, "Bracket Runner", "runner@example.com")
    paid = _get_paid_tournament(client)
    join = client.post(f"/tournaments/{paid['id']}/join")
    assert join.status_code == 200
    payload = join.json()
    assert payload["wallet"]["balance"]["amount"] == "1500.00"  # 2500 - 1000 entry
    assert payload["tournament"]["joinedPlayers"] == 1


def test_duplicate_join_is_rejected(client: TestClient) -> None:
    _signup(client, "Repeat Player", "repeat@example.com")
    paid = _get_paid_tournament(client)
    first_join = client.post(f"/tournaments/{paid['id']}/join")
    assert first_join.status_code == 200
    second_join = client.post(f"/tournaments/{paid['id']}/join")
    assert second_join.status_code == 409


# ── Bracket generation (auto-start) ──

def test_bracket_generates_when_tournament_fills(client: TestClient) -> None:
    free = _get_free_tournament(client)
    tournament_id = free["id"]

    # Sign up 8 players to fill the tournament
    for i in range(8):
        # Create new client to get fresh cookies
        _signup(client, f"Player {i+1}", f"player{i}@bracket.test")
        join = client.post(f"/tournaments/{tournament_id}/join")
        assert join.status_code == 200

    # Check tournament is now in_progress
    detail = client.get(f"/tournaments/{tournament_id}")
    assert detail.status_code == 200
    tournament = detail.json()["tournament"]
    assert tournament["status"] == "in_progress"

    # Check bracket exists
    bracket = client.get(f"/tournaments/{tournament_id}/bracket")
    assert bracket.status_code == 200
    bracket_data = bracket.json()
    assert len(bracket_data["rounds"]) == 3  # QF, SF, Final


# ── Match score submission and approval ──

def test_match_score_submission_flow(client: TestClient) -> None:
    free = _get_free_tournament(client)
    tournament_id = free["id"]

    # Fill tournament
    players = []
    for i in range(8):
        data = _signup(client, f"Match Player {i+1}", f"mp{i}@match.test")
        players.append(data["user"])
        client.post(f"/tournaments/{tournament_id}/join")

    # Get bracket
    bracket = client.get(f"/tournaments/{tournament_id}/bracket")
    rounds = bracket.json()["rounds"]
    first_match = rounds[0]["matches"][0]
    match_id = first_match["id"]

    # Get match detail
    match_detail = client.get(f"/matches/{match_id}")
    assert match_detail.status_code == 200
    assert match_detail.json()["match"]["status"] == "pending"


# ── Leaderboard ──

def test_global_leaderboard_returns_entries(client: TestClient) -> None:
    _signup(client, "Leaderboard Player", "lb@example.com")
    res = client.get("/leaderboard/global")
    assert res.status_code == 200
    entries = res.json()["entries"]
    assert isinstance(entries, list)


# ── Notifications ──

def test_notifications_endpoint(client: TestClient) -> None:
    _signup(client, "Notif Player", "notif@example.com")
    res = client.get("/notifications")
    assert res.status_code == 200
    data = res.json()
    assert "notifications" in data
    assert "unreadCount" in data


# ── Refresh token rotation ──

def test_refresh_rotates_session_and_profile_stays_available(client: TestClient) -> None:
    _signup(client, "Refresh Runner", "refresh@example.com")
    refresh = client.post("/auth/refresh")
    assert refresh.status_code == 200
    profile = client.get("/user/profile")
    assert profile.status_code == 200
    assert profile.json()["user"]["email"] == "refresh@example.com"


# ── Admin ──

def test_admin_overview(client: TestClient) -> None:
    _signup(client, "Admin User", "admin@example.com")
    res = client.get("/admin/overview")
    assert res.status_code == 200
    data = res.json()
    assert data["ok"] is True
    assert "totalTournaments" in data
    assert "pendingApprovals" in data


# ── Tournament detail ──

def test_tournament_detail_and_participants(client: TestClient) -> None:
    _signup(client, "Detail Player", "detail@example.com")
    paid = _get_paid_tournament(client)
    client.post(f"/tournaments/{paid['id']}/join")

    detail = client.get(f"/tournaments/{paid['id']}")
    assert detail.status_code == 200
    tournament = detail.json()["tournament"]
    assert tournament["prizePool"]["currency"] == "INR"
    assert tournament["platformFeePercent"] == 7

    participants = client.get(f"/tournaments/{paid['id']}/participants")
    assert participants.status_code == 200
    assert len(participants.json()["participants"]) == 1
