from __future__ import annotations

from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, Response

from .models import (
    LeaderboardEntry,
    Money,
    TournamentDetail,
    TournamentSummary,
    UserProfile,
    WalletSnapshot,
    WalletTransaction,
)
from .db import (
    ACCESS_TTL,
    REFRESH_TTL,
    SQLAlchemyRepository,
    TournamentRecord,
    UserRecord,
    create_id,
    utcnow,
)
from .security import hash_password, verify_password


ACCESS_COOKIE = "wta_access_token"
REFRESH_COOKIE = "wta_refresh_token"


def cents_to_money(cents: int, currency: str = "USD") -> Money:
    return Money(amount=f"{cents / 100:.2f}", currency=currency)


def money_to_cents(amount: str) -> int:
    try:
        normalized = Decimal(amount)
    except InvalidOperation as error:
        raise HTTPException(status_code=400, detail="Amount must be a positive number") from error

    if normalized <= 0:
        raise HTTPException(status_code=400, detail="Amount must be a positive number")

    return int(normalized * 100)


class WTAService:
    def __init__(self, store: SQLAlchemyRepository | None = None) -> None:
        self.store = store or SQLAlchemyRepository()

    def serialize_user(self, user: UserRecord) -> UserProfile:
        return UserProfile(
            id=user.id,
            name=user.name,
            email=user.email,
            walletBalance=f"{user.wallet_balance_cents / 100:.2f}",
            role=user.role,
        )

    def serialize_wallet(self, user: UserRecord) -> WalletSnapshot:
        entries = sorted(
            self.store.list_wallet_entries(user.id),
            key=lambda item: item.created_at,
            reverse=True,
        )
        return WalletSnapshot(
            balance=cents_to_money(user.wallet_balance_cents),
            transactions=[
                WalletTransaction(
                    id=entry.id,
                    type=entry.type,
                    amount=cents_to_money(entry.amount_cents),
                    createdAt=entry.created_at,
                    referenceType=entry.reference_type,
                    referenceId=entry.reference_id,
                )
                for entry in entries
            ],
        )

    def serialize_tournament_summary(self, tournament: TournamentRecord) -> TournamentSummary:
        return TournamentSummary(
            id=tournament.id,
            name=tournament.name,
            entryFee=cents_to_money(tournament.entry_fee_cents),
            maxPlayers=tournament.max_players,
            joinedPlayers=len(tournament.participants),
            status=tournament.status,
        )

    def serialize_tournament_detail(self, tournament: TournamentRecord) -> TournamentDetail:
        summary = self.serialize_tournament_summary(tournament)
        return TournamentDetail(
            **summary.model_dump(),
            prizePool=cents_to_money(tournament.prize_pool_cents),
            bracketType=tournament.bracket_type,
            bracketState=tournament.bracket_state,
        )

    def _set_session_cookies(self, response: Response, user_id: str) -> None:
        now = utcnow()
        access_token = create_id("access")
        refresh_token = create_id("refresh")
        self.store.create_session(
            token=access_token, user_id=user_id, kind="access", expires_at=now + ACCESS_TTL
        )
        self.store.create_session(
            token=refresh_token, user_id=user_id, kind="refresh", expires_at=now + REFRESH_TTL
        )
        response.set_cookie(ACCESS_COOKIE, access_token, httponly=True, samesite="lax", path="/")
        response.set_cookie(REFRESH_COOKIE, refresh_token, httponly=True, samesite="lax", path="/")

    def get_user_from_token(self, access_token: str | None) -> UserRecord | None:
        if not access_token:
            return None

        session = self.store.get_session(access_token, "access")
        if not session:
            return None

        if session.expires_at < utcnow():
            self.store.delete_session(access_token, "access")
            return None

        return self.store.get_user_by_id(session.user_id)

    def require_user(self, access_token: str | None) -> UserRecord:
        user = self.get_user_from_token(access_token)
        if not user:
            raise HTTPException(status_code=401, detail="Authentication required")
        return user

    def _normalize_email(self, email: str) -> str:
        normalized_email = email.strip().lower()
        if "@" not in normalized_email or normalized_email.startswith("@") or normalized_email.endswith("@"):
            raise HTTPException(status_code=400, detail="A valid email address is required")
        return normalized_email

    def signup(self, name: str, email: str, password: str, response: Response) -> UserProfile:
        normalized_email = self._normalize_email(email)
        if self.store.get_user_by_email(normalized_email):
            raise HTTPException(status_code=409, detail="An account already exists for this email")

        user = self.store.create_user_with_bonus(
            name=name.strip(),
            email=normalized_email,
            password_hash=hash_password(password),
            bonus_cents=2500,
        )
        self._set_session_cookies(response, user.id)
        return self.serialize_user(user)

    def login(self, email: str, password: str, response: Response) -> UserProfile:
        normalized_email = self._normalize_email(email)
        user = self.store.get_user_by_email(normalized_email)
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        self._set_session_cookies(response, user.id)
        return self.serialize_user(user)

    def refresh(self, response: Response, refresh_token: str | None) -> UserProfile:
        if not refresh_token:
            raise HTTPException(status_code=401, detail="Missing refresh token")

        session = self.store.get_session(refresh_token, "refresh")
        if not session or session.expires_at < utcnow():
            self.store.delete_session(refresh_token, "refresh")
            raise HTTPException(status_code=401, detail="Refresh token is invalid or expired")

        user = self.store.get_user_by_id(session.user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        self.store.delete_session(refresh_token, "refresh")
        self._set_session_cookies(response, user.id)
        return self.serialize_user(user)

    def wallet_snapshot(self, user: UserRecord) -> WalletSnapshot:
        return self.serialize_wallet(user)

    def deduct_from_wallet(
        self,
        user: UserRecord,
        amount: str,
        reference_type: str,
        reference_id: str,
    ) -> WalletSnapshot:
        amount_cents = money_to_cents(amount)
        try:
            updated_user = self.store.deduct_wallet(
                user_id=user.id,
                amount_cents=amount_cents,
                reference_type=reference_type,
                reference_id=reference_id,
            )
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return self.serialize_wallet(updated_user)

    def list_tournaments(self) -> list[TournamentSummary]:
        return [
            self.serialize_tournament_summary(tournament)
            for tournament in self.store.list_tournaments()
        ]

    def get_tournament(self, tournament_id: str) -> TournamentDetail:
        tournament = self.store.get_tournament(tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        return self.serialize_tournament_detail(tournament)

    def join_tournament(
        self,
        user: UserRecord,
        tournament_id: str,
    ) -> tuple[TournamentDetail, WalletSnapshot]:
        try:
            updated_user, tournament = self.store.join_tournament(
                user_id=user.id,
                tournament_id=tournament_id,
            )
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ArithmeticError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error

        return self.serialize_tournament_detail(tournament), self.serialize_wallet(updated_user)

    def global_leaderboard(self) -> list[LeaderboardEntry]:
        return [
            LeaderboardEntry(
                userId=user.id,
                displayName=user.name,
                wins=0,
                losses=0,
                earnings=Money(amount="0.00", currency="USD"),
            )
            for user in self.store.list_users()
        ]

    def tournament_leaderboard(self, tournament_id: str) -> list[LeaderboardEntry]:
        tournament = self.store.get_tournament(tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        return [
            LeaderboardEntry(
                userId=user.id,
                displayName=user.name,
                wins=0,
                losses=0,
                earnings=Money(amount="0.00", currency="USD"),
            )
            for user in self.store.list_tournament_users(tournament_id)
        ]
