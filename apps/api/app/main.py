from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone

from fastapi import Cookie, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .db import SQLAlchemyRepository, create_id
from .models import (
    AuthResponse,
    BracketResponse,
    ErrorResponse,
    LeaderboardResponse,
    LoginRequest,
    MatchResponse,
    NotificationsResponse,
    ParticipantsResponse,
    PaymentOrderResponse,
    PaymentVerifyRequest,
    RefreshRequest,
    ScoreApproveRequest,
    ScoreSubmitRequest,
    SignupRequest,
    TournamentJoinRequest,
    TournamentJoinResponse,
    TournamentResponse,
    TournamentCreateRequest,
    TournamentsResponse,
    WalletDeductRequest,
    WalletResponse,
    WalletTopupRequest,
    WalletTransferRequest,
)
from .service import WTAService
from .payments.razorpay_service import create_order, verify_payment_signature, get_key_id
from .game.room_manager import room_manager

logger = logging.getLogger(__name__)

app = FastAPI(title="WTA API", version="0.2.0")
service = WTAService(SQLAlchemyRepository())

# CORS for Razorpay checkout callbacks and frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", 
        "http://127.0.0.1:3000",
        "http://192.168.1.4:3000"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(_, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"ok": False, "message": exc.detail})


# ── Health ──

@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "service": "api",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "activeGameRooms": room_manager.active_room_count,
    }


# ── Auth ──

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
    return AuthResponse(user=service.serialize_user(user, include_stats=True))


# ── Wallet ──

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
    wallet_data = service.deduct_from_wallet(user, payload.amount, payload.referenceType, payload.referenceId)
    return WalletResponse(wallet=wallet_data)


@app.post("/wallet/transfer", response_model=WalletResponse, responses={401: {"model": ErrorResponse}})
async def wallet_transfer(
    payload: WalletTransferRequest,
    wta_access_token: str | None = Cookie(default=None),
) -> WalletResponse:
    user = service.require_user(wta_access_token)
    wallet_data = service.transfer_credits(user, payload.recipientId, payload.amount)
    return WalletResponse(wallet=wallet_data)


# ── Tournaments ──

@app.get("/tournaments", response_model=TournamentsResponse)
async def tournaments() -> TournamentsResponse:
    return TournamentsResponse(tournaments=service.list_tournaments())


@app.post("/tournaments/create", response_model=TournamentResponse, responses={401: {"model": ErrorResponse}})
async def tournament_create(
    payload: TournamentCreateRequest,
    wta_access_token: str | None = Cookie(default=None),
) -> TournamentResponse:
    user = service.require_user(wta_access_token)
    tournament_data = service.create_tournament(
        host=user,
        name=payload.name,
        entry_fee=payload.entryFee,
        max_players=payload.maxPlayers,
        team_size=payload.teamSize,
        tournament_type=payload.tournamentType,
        bracket_type=payload.bracketType,
        password=payload.password,
    )
    return TournamentResponse(tournament=tournament_data)


@app.get("/tournaments/{tournament_id}", response_model=TournamentResponse, responses={404: {"model": ErrorResponse}})
async def tournament_detail(tournament_id: str) -> TournamentResponse:
    return TournamentResponse(tournament=service.get_tournament(tournament_id))


@app.delete("/tournaments/{tournament_id}", response_model=dict, responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
async def tournament_delete(
    tournament_id: str,
    wta_access_token: str | None = Cookie(default=None),
) -> dict:
    user = service.require_user(wta_access_token)
    service.delete_tournament(user, tournament_id)
    return {"ok": True, "message": "Tournament deleted and participants refunded"}


@app.post(
    "/tournaments/{tournament_id}/join",
    response_model=TournamentJoinResponse,
    responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}},
)
async def tournament_join(
    tournament_id: str,
    payload: TournamentJoinRequest | None = None,
    wta_access_token: str | None = Cookie(default=None),
) -> TournamentJoinResponse:
    user = service.require_user(wta_access_token)
    team_id = payload.teamId if payload else None
    team_code = payload.teamCode if payload else None
    password = payload.password if payload else None
    tournament, wallet_data = service.join_tournament(user, tournament_id, team_id=team_id, team_code=team_code, password=password)
    return TournamentJoinResponse(tournament=tournament, wallet=wallet_data)


@app.get("/tournaments/{tournament_id}/bracket", response_model=BracketResponse, responses={404: {"model": ErrorResponse}})
async def tournament_bracket(tournament_id: str) -> BracketResponse:
    return service.get_bracket(tournament_id)


@app.get("/tournaments/{tournament_id}/participants", response_model=ParticipantsResponse, responses={404: {"model": ErrorResponse}})
async def tournament_participants(tournament_id: str) -> ParticipantsResponse:
    return ParticipantsResponse(participants=service.get_participants(tournament_id))


# ── Matches ──

@app.get("/matches/{match_id}", response_model=MatchResponse, responses={404: {"model": ErrorResponse}})
async def match_detail(match_id: str) -> MatchResponse:
    return MatchResponse(match=service.get_match_detail(match_id))


@app.post("/matches/{match_id}/start", response_model=MatchResponse, responses={404: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
async def match_start(match_id: str) -> MatchResponse:
    return MatchResponse(match=service.start_match(match_id))


@app.post("/matches/{match_id}/submit-score", response_model=MatchResponse, responses={401: {"model": ErrorResponse}, 404: {"model": ErrorResponse}})
async def match_submit_score(
    match_id: str,
    payload: ScoreSubmitRequest,
    wta_access_token: str | None = Cookie(default=None),
) -> MatchResponse:
    user = service.require_user(wta_access_token)
    return MatchResponse(match=service.submit_score(match_id, user.id, payload.score))


@app.post("/matches/{match_id}/approve-scores", response_model=MatchResponse, responses={401: {"model": ErrorResponse}, 409: {"model": ErrorResponse}})
async def match_approve_scores(
    match_id: str,
    wta_access_token: str | None = Cookie(default=None),
) -> MatchResponse:
    user = service.require_user(wta_access_token)
    return MatchResponse(match=service.approve_scores(match_id, user))


# ── Payments ──

@app.post("/payments/create-order", response_model=PaymentOrderResponse, responses={401: {"model": ErrorResponse}})
async def payment_create_order(
    payload: WalletTopupRequest,
    wta_access_token: str | None = Cookie(default=None),
) -> PaymentOrderResponse:
    user = service.require_user(wta_access_token)

    amount_paise = payload.amount * 100  # Convert rupees to paise
    idempotency_key = payload.idempotencyKey or create_id("idem")

    # Check for duplicate
    existing = service.store.get_payment_by_idempotency_key(idempotency_key)
    if existing and existing.status == "completed":
        raise HTTPException(status_code=409, detail="Payment already processed")

    try:
        razorpay_order = create_order(
            amount_paise=amount_paise,
            currency="INR",
            notes={"user_id": user.id, "type": "wallet_topup"},
        )
    except Exception as e:
        logger.error(f"Razorpay order creation failed: {e}")
        raise HTTPException(status_code=502, detail="Payment service unavailable")

    # Persist payment record
    payment = service.store.create_payment(
        user_id=user.id,
        amount_cents=amount_paise,
        currency="INR",
        provider_order_id=razorpay_order["id"],
        idempotency_key=idempotency_key,
        is_test=get_key_id().startswith("rzp_test_"),
    )

    return PaymentOrderResponse(
        orderId=payment.id,
        razorpayOrderId=razorpay_order["id"],
        amount=amount_paise,
        currency="INR",
        keyId=get_key_id(),
    )


@app.post("/payments/verify", responses={401: {"model": ErrorResponse}})
async def payment_verify(
    payload: PaymentVerifyRequest,
    wta_access_token: str | None = Cookie(default=None),
) -> JSONResponse:
    user = service.require_user(wta_access_token)

    # Find the payment by Razorpay order ID
    payment = service.store.get_payment_by_order_id(payload.razorpayOrderId)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment.status == "completed":
        return JSONResponse(content={"ok": True, "message": "Payment already verified"})

    # Verify signature
    is_valid = verify_payment_signature(
        payload.razorpayOrderId,
        payload.razorpayPaymentId,
        payload.razorpaySignature,
    )

    if not is_valid:
        service.store.update_payment(payment.id, status="failed")
        raise HTTPException(status_code=400, detail="Payment verification failed")

    # Mark payment as completed
    service.store.update_payment(
        payment.id,
        status="completed",
        provider_payment_id=payload.razorpayPaymentId,
        provider_signature=payload.razorpaySignature,
    )

    # Credit wallet
    service.store.credit_wallet(
        user_id=user.id,
        amount_cents=payment.amount_cents,
        reference_type="wallet_topup",
        reference_id=payment.id,
        transaction_type="deposit",
        payment_id=payment.id,
        is_test=payment.is_test,
    )

    return JSONResponse(content={"ok": True, "message": "Payment verified and wallet credited"})


@app.post("/payments/webhook")
async def payment_webhook(request: Request) -> JSONResponse:
    """Razorpay webhook for server-side payment verification."""
    body = await request.body()
    signature = request.headers.get("x-razorpay-signature", "")

    from .payments.razorpay_service import verify_webhook_signature
    if not verify_webhook_signature(body, signature):
        return JSONResponse(status_code=400, content={"ok": False, "message": "Invalid signature"})

    try:
        event = json.loads(body)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"ok": False, "message": "Invalid JSON"})

    event_type = event.get("event", "")
    if event_type == "payment.captured":
        payment_entity = event.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")

        if order_id:
            payment = service.store.get_payment_by_order_id(order_id)
            if payment and payment.status != "completed":
                service.store.update_payment(payment.id, status="completed")
                service.store.credit_wallet(
                    user_id=payment.user_id,
                    amount_cents=payment.amount_cents,
                    reference_type="wallet_topup",
                    reference_id=payment.id,
                    transaction_type="deposit",
                    payment_id=payment.id,
                )

    return JSONResponse(content={"ok": True})


# ── Leaderboard ──

@app.get("/leaderboard/global", response_model=LeaderboardResponse)
async def leaderboard_global() -> LeaderboardResponse:
    return LeaderboardResponse(entries=service.global_leaderboard())


@app.get("/leaderboard/tournaments/{tournament_id}", response_model=LeaderboardResponse, responses={404: {"model": ErrorResponse}})
async def leaderboard_tournament(tournament_id: str) -> LeaderboardResponse:
    return LeaderboardResponse(entries=service.tournament_leaderboard(tournament_id))


# ── Notifications ──

@app.get("/notifications", response_model=NotificationsResponse, responses={401: {"model": ErrorResponse}})
async def get_notifications(wta_access_token: str | None = Cookie(default=None)) -> NotificationsResponse:
    user = service.require_user(wta_access_token)
    items, unread = service.get_notifications(user.id)
    return NotificationsResponse(notifications=items, unreadCount=unread)


@app.post("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    wta_access_token: str | None = Cookie(default=None),
) -> JSONResponse:
    service.require_user(wta_access_token)
    service.mark_notification_read(notification_id)
    return JSONResponse(content={"ok": True})


# ── Admin ──

@app.get("/admin/overview")
async def admin_overview(wta_access_token: str | None = Cookie(default=None)) -> JSONResponse:
    user = service.require_user(wta_access_token)
    overview = service.get_admin_overview()
    return JSONResponse(content={"ok": True, **overview})


# ── WebSocket Game Room ──

@app.websocket("/ws/match/{match_id}")
async def websocket_match(websocket: WebSocket, match_id: str, token: str = ""):
    """WebSocket endpoint for real-time game play."""
    await websocket.accept()

    # Authenticate via token
    user = service.get_user_from_token(token)
    if not user:
        await websocket.send_json({"type": "error", "message": "Authentication required"})
        await websocket.close(code=4001)
        return

    # Verify user is part of this match
    match = service.store.get_match(match_id)
    if not match:
        await websocket.send_json({"type": "error", "message": "Match not found"})
        await websocket.close(code=4004)
        return

    if user.id not in (match.player1_id, match.player2_id):
        await websocket.send_json({"type": "error", "message": "You are not a player in this match"})
        await websocket.close(code=4003)
        return

    # Join the game room
    try:
        room = await room_manager.join_room(
            match_id=match_id,
            tournament_id=match.tournament_id,
            user_id=user.id,
            user_name=user.name,
            websocket=websocket,
        )
    except ValueError as e:
        await websocket.send_json({"type": "error", "message": str(e)})
        await websocket.close(code=4009)
        return

    # Send initial state
    await websocket.send_json({
        "type": "connected",
        "matchId": match_id,
        "userId": user.id,
        "userName": user.name,
    })

    try:
        while True:
            data = await websocket.receive_text()
            try:
                message = json.loads(data)
                await room_manager.handle_message(room, user.id, message)
            except json.JSONDecodeError:
                await websocket.send_json({"type": "error", "message": "Invalid JSON"})
    except WebSocketDisconnect:
        await room_manager.handle_disconnect(room, user.id)
        logger.info(f"Player {user.id} disconnected from match {match_id}")
    except Exception as e:
        logger.error(f"WebSocket error for {user.id} in match {match_id}: {e}")
        await room_manager.handle_disconnect(room, user.id)
