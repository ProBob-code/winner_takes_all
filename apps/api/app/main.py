from __future__ import annotations

from datetime import datetime, timezone

from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse

from .db import SQLAlchemyRepository
from .models import (
    AuthResponse,
    ErrorResponse,
    LeaderboardResponse,
    LoginRequest,
    RefreshRequest,
    SignupRequest,
    TournamentJoinResponse,
    TournamentResponse,
    TournamentsResponse,
    WalletDeductRequest,
    WalletResponse,
)
from .service import WTAService

app = FastAPI(title="WTA API", version="0.1.0")
service = WTAService(SQLAlchemyRepository())


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "message": exc.detail})


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "service": "api", "timestamp": datetime.now(timezone.utc).isoformat()}


@app.post("/auth/signup", response_model=AuthResponse, responses={409: {"model": ErrorResponse}})
async def signup(payload: SignupRequest, response: Response) -> AuthResponse:
    user = service.signup(payload.name, payload.email, payload.password, response)
    return AuthResponse(user=user)


@app.post("/auth/login", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
async def login(payload: LoginRequest, response: Response) -> AuthResponse:
    user = service.login(payload.email, payload.password, response)
    return AuthResponse(user=user)


@app.post("/auth/refresh", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
async def refresh(
    response: Response,
    payload: RefreshRequest | None = None,
    wta_refresh_token: str | None = Cookie(default=None),
) -> AuthResponse:
    refresh_token = payload.refreshToken if payload and payload.refreshToken else wta_refresh_token
    user = service.refresh(response, refresh_token)
    return AuthResponse(user=user)


@app.get("/user/profile", response_model=AuthResponse, responses={401: {"model": ErrorResponse}})
async def profile(wta_access_token: str | None = Cookie(default=None)) -> AuthResponse:
    user = service.require_user(wta_access_token)
    return AuthResponse(user=service.serialize_user(user))


@app.get("/wallet", response_model=WalletResponse, responses={401: {"model": ErrorResponse}})
async def wallet(wta_access_token: str | None = Cookie(default=None)) -> WalletResponse:
    user = service.require_user(wta_access_token)
    return WalletResponse(wallet=service.wallet_snapshot(user))


@app.post("/wallet/deduct", response_model=WalletResponse, responses={401: {"model": ErrorResponse}})
async def wallet_deduct(
    payload: WalletDeductRequest,
    wta_access_token: str | None = Cookie(default=None),
) -> WalletResponse:
    user = service.require_user(wta_access_token)
    wallet = service.deduct_from_wallet(user, payload.amount, payload.referenceType, payload.referenceId)
    return WalletResponse(wallet=wallet)


@app.get("/tournaments", response_model=TournamentsResponse)
async def tournaments() -> TournamentsResponse:
    return TournamentsResponse(tournaments=service.list_tournaments())


@app.get("/tournaments/{tournament_id}", response_model=TournamentResponse, responses={404: {"model": ErrorResponse}})
async def tournament_detail(tournament_id: str) -> TournamentResponse:
    return TournamentResponse(tournament=service.get_tournament(tournament_id))


@app.post(
    "/tournaments/{tournament_id}/join",
    response_model=TournamentJoinResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
async def tournament_join(
    tournament_id: str,
    wta_access_token: str | None = Cookie(default=None),
) -> TournamentJoinResponse:
    user = service.require_user(wta_access_token)
    tournament, wallet = service.join_tournament(user, tournament_id)
    return TournamentJoinResponse(tournament=tournament, wallet=wallet)


@app.get("/leaderboard/global", response_model=LeaderboardResponse)
async def leaderboard_global() -> LeaderboardResponse:
    return LeaderboardResponse(entries=service.global_leaderboard())


@app.get(
    "/leaderboard/tournaments/{tournament_id}",
    response_model=LeaderboardResponse,
    responses={404: {"model": ErrorResponse}},
)
async def leaderboard_tournament(tournament_id: str) -> LeaderboardResponse:
    return LeaderboardResponse(entries=service.tournament_leaderboard(tournament_id))


@app.post("/payments/create-order", responses={501: {"model": ErrorResponse}})
async def payment_create_order() -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"ok": False, "message": "Payment order creation is scaffolded but not implemented yet"},
    )


@app.post("/payments/webhook", responses={501: {"model": ErrorResponse}})
async def payment_webhook() -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"ok": False, "message": "Payment webhook verification is scaffolded but not implemented yet"},
    )


@app.get("/matches/{match_id}", responses={501: {"model": ErrorResponse}})
async def match_detail(match_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"ok": False, "message": f"Match detail for {match_id} is scaffolded but not implemented yet"},
    )


@app.post("/matches/{match_id}/start", responses={501: {"model": ErrorResponse}})
async def match_start(match_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"ok": False, "message": f"Match start for {match_id} is scaffolded but not implemented yet"},
    )


@app.post("/matches/{match_id}/result", responses={501: {"model": ErrorResponse}})
async def match_result(match_id: str) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"ok": False, "message": f"Match result submission for {match_id} is scaffolded but not implemented yet"},
    )


@app.get("/admin/overview", responses={501: {"model": ErrorResponse}})
async def admin_overview() -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={"ok": False, "message": "Admin overview is scaffolded but not implemented yet"},
    )
