from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from secrets import token_hex

from sqlalchemy import delete, func, select
from sqlalchemy.orm import selectinload, sessionmaker

from .models import ParticipantORM, SessionORM, TournamentORM, UserORM, WalletORM, WalletTransactionORM
from .session import build_engine, init_db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def create_id(prefix: str) -> str:
    return f"{prefix}_{token_hex(8)}"


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@dataclass
class SessionRecord:
    token: str
    user_id: str
    expires_at: datetime


@dataclass
class UserRecord:
    id: str
    name: str
    email: str
    password_hash: str
    role: str
    wallet_balance_cents: int
    created_at: datetime


@dataclass
class WalletEntryRecord:
    id: str
    user_id: str
    type: str
    amount_cents: int
    created_at: datetime
    reference_type: str
    reference_id: str


@dataclass
class TournamentRecord:
    id: str
    name: str
    entry_fee_cents: int
    prize_pool_cents: int
    max_players: int
    status: str
    bracket_type: str
    bracket_state: dict | None = None
    participants: list[str] = field(default_factory=list)


ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)


DEFAULT_TOURNAMENTS = [
    {
        "name": "Friday Knockout",
        "entry_fee_cents": 1000,
        "prize_pool_cents": 8000,
        "max_players": 8,
        "status": "open",
        "bracket_type": "single_elimination",
        "bracket_state": {
            "rounds": [
                {"name": "Quarterfinals", "matches": 4},
                {"name": "Semifinals", "matches": 2},
                {"name": "Final", "matches": 1},
            ]
        },
    },
    {
        "name": "Sunday Finals Qualifier",
        "entry_fee_cents": 0,
        "prize_pool_cents": 2500,
        "max_players": 16,
        "status": "open",
        "bracket_type": "single_elimination",
        "bracket_state": {
            "rounds": [
                {"name": "Round of 16", "matches": 8},
                {"name": "Quarterfinals", "matches": 4},
                {"name": "Semifinals", "matches": 2},
                {"name": "Final", "matches": 1},
            ]
        },
    },
]


class SQLAlchemyRepository:
    def __init__(
        self,
        database_url: str | None = None,
        session_factory: sessionmaker | None = None,
        initialize_schema: bool | None = None,
        seed_defaults: bool = True,
    ) -> None:
        if session_factory is not None:
            self.session_factory = session_factory
            self.engine = session_factory.kw["bind"]
        else:
            self.engine = build_engine(database_url)
            self.session_factory = sessionmaker(
                bind=self.engine,
                autoflush=False,
                expire_on_commit=False,
                future=True,
            )

        should_initialize = initialize_schema
        if should_initialize is None:
            should_initialize = os.getenv("WTA_AUTO_INIT_DB", "true").lower() == "true"

        if should_initialize:
            init_db(self.engine)

        if seed_defaults:
            self.ensure_seed_data()

    def ensure_seed_data(self) -> None:
        with self.session_factory.begin() as session:
            tournament_count = session.scalar(select(func.count(TournamentORM.id))) or 0
            if tournament_count > 0:
                return

            for tournament in DEFAULT_TOURNAMENTS:
                session.add(
                    TournamentORM(
                        id=create_id("tournament"),
                        name=tournament["name"],
                        entry_fee_cents=tournament["entry_fee_cents"],
                        prize_pool_cents=tournament["prize_pool_cents"],
                        max_players=tournament["max_players"],
                        status=tournament["status"],
                        bracket_type=tournament["bracket_type"],
                        bracket_state=tournament["bracket_state"],
                    )
                )

    def _to_user_record(self, user: UserORM | None) -> UserRecord | None:
        if user is None:
            return None

        balance_cents = user.wallet.balance_cents if user.wallet is not None else 0
        return UserRecord(
            id=user.id,
            name=user.name,
            email=user.email,
            password_hash=user.password_hash,
            role=user.role,
            wallet_balance_cents=balance_cents,
            created_at=ensure_utc(user.created_at),
        )

    def _to_wallet_entry_record(self, entry: WalletTransactionORM) -> WalletEntryRecord:
        return WalletEntryRecord(
            id=entry.id,
            user_id=entry.user_id,
            type=entry.type,
            amount_cents=entry.amount_cents,
            created_at=ensure_utc(entry.created_at),
            reference_type=entry.reference_type,
            reference_id=entry.reference_id,
        )

    def _to_tournament_record(self, tournament: TournamentORM | None) -> TournamentRecord | None:
        if tournament is None:
            return None

        return TournamentRecord(
            id=tournament.id,
            name=tournament.name,
            entry_fee_cents=tournament.entry_fee_cents,
            prize_pool_cents=tournament.prize_pool_cents,
            max_players=tournament.max_players,
            status=tournament.status,
            bracket_type=tournament.bracket_type,
            bracket_state=tournament.bracket_state,
            participants=[participant.user_id for participant in tournament.participants],
        )

    def get_user_by_email(self, email: str) -> UserRecord | None:
        with self.session_factory() as session:
            user = session.execute(
                select(UserORM)
                .where(UserORM.email == email)
                .options(selectinload(UserORM.wallet))
            ).scalar_one_or_none()
            return self._to_user_record(user)

    def get_user_by_id(self, user_id: str) -> UserRecord | None:
        with self.session_factory() as session:
            user = session.execute(
                select(UserORM)
                .where(UserORM.id == user_id)
                .options(selectinload(UserORM.wallet))
            ).scalar_one_or_none()
            return self._to_user_record(user)

    def list_users(self) -> list[UserRecord]:
        with self.session_factory() as session:
            users = session.execute(
                select(UserORM)
                .options(selectinload(UserORM.wallet))
                .order_by(UserORM.name.asc())
            ).scalars().all()
            return [self._to_user_record(user) for user in users if user is not None]

    def create_user_with_bonus(
        self,
        *,
        name: str,
        email: str,
        password_hash: str,
        bonus_cents: int,
    ) -> UserRecord:
        with self.session_factory.begin() as session:
            user = UserORM(
                id=create_id("user"),
                name=name,
                email=email,
                password_hash=password_hash,
                role="player",
            )
            wallet = WalletORM(
                id=create_id("wallet"),
                user=user,
                balance_cents=bonus_cents,
            )
            session.add(user)
            session.add(wallet)
            session.add(
                WalletTransactionORM(
                    id=create_id("wallettxn"),
                    wallet=wallet,
                    user=user,
                    type="manual_adjustment",
                    amount_cents=bonus_cents,
                    balance_after_cents=bonus_cents,
                    reference_type="signup_bonus",
                    reference_id=user.id,
                )
            )
            session.flush()
            return self._to_user_record(user)

    def list_wallet_entries(self, user_id: str) -> list[WalletEntryRecord]:
        with self.session_factory() as session:
            entries = session.execute(
                select(WalletTransactionORM)
                .where(WalletTransactionORM.user_id == user_id)
                .order_by(WalletTransactionORM.created_at.desc())
            ).scalars().all()
            return [self._to_wallet_entry_record(entry) for entry in entries]

    def create_session(self, *, token: str, user_id: str, kind: str, expires_at: datetime) -> None:
        with self.session_factory.begin() as session:
            session.add(
                SessionORM(
                    id=create_id("session"),
                    token=token,
                    user_id=user_id,
                    kind=kind,
                    expires_at=expires_at,
                )
            )

    def get_session(self, token: str, kind: str) -> SessionRecord | None:
        with self.session_factory() as session:
            record = session.execute(
                select(SessionORM)
                .where(SessionORM.token == token, SessionORM.kind == kind)
            ).scalar_one_or_none()
            if record is None:
                return None
            return SessionRecord(
                token=record.token,
                user_id=record.user_id,
                expires_at=ensure_utc(record.expires_at),
            )

    def delete_session(self, token: str, kind: str) -> None:
        with self.session_factory.begin() as session:
            session.execute(
                delete(SessionORM).where(SessionORM.token == token, SessionORM.kind == kind)
            )

    def list_tournaments(self) -> list[TournamentRecord]:
        with self.session_factory() as session:
            tournaments = session.execute(
                select(TournamentORM)
                .options(selectinload(TournamentORM.participants))
                .order_by(TournamentORM.name.asc())
            ).scalars().all()
            return [self._to_tournament_record(tournament) for tournament in tournaments if tournament is not None]

    def get_tournament(self, tournament_id: str) -> TournamentRecord | None:
        with self.session_factory() as session:
            tournament = session.execute(
                select(TournamentORM)
                .where(TournamentORM.id == tournament_id)
                .options(selectinload(TournamentORM.participants))
            ).scalar_one_or_none()
            return self._to_tournament_record(tournament)

    def deduct_wallet(
        self,
        *,
        user_id: str,
        amount_cents: int,
        reference_type: str,
        reference_id: str,
    ) -> UserRecord:
        with self.session_factory.begin() as session:
            user = session.execute(
                select(UserORM)
                .where(UserORM.id == user_id)
                .options(selectinload(UserORM.wallet))
            ).scalar_one_or_none()
            if user is None or user.wallet is None:
                raise ValueError("User not found")
            if user.wallet.balance_cents < amount_cents:
                raise ValueError("Insufficient wallet balance")

            user.wallet.balance_cents -= amount_cents
            session.add(
                WalletTransactionORM(
                    id=create_id("wallettxn"),
                    wallet=user.wallet,
                    user=user,
                    type="entry_fee_debit",
                    amount_cents=amount_cents,
                    balance_after_cents=user.wallet.balance_cents,
                    reference_type=reference_type,
                    reference_id=reference_id,
                )
            )
            session.flush()
            return self._to_user_record(user)

    def join_tournament(self, *, user_id: str, tournament_id: str) -> tuple[UserRecord, TournamentRecord]:
        with self.session_factory.begin() as session:
            user = session.execute(
                select(UserORM)
                .where(UserORM.id == user_id)
                .options(selectinload(UserORM.wallet))
            ).scalar_one_or_none()
            tournament = session.execute(
                select(TournamentORM)
                .where(TournamentORM.id == tournament_id)
                .options(selectinload(TournamentORM.participants))
            ).scalar_one_or_none()

            if user is None or user.wallet is None:
                raise ValueError("User not found")
            if tournament is None:
                raise LookupError("Tournament not found")
            if any(participant.user_id == user_id for participant in tournament.participants):
                raise RuntimeError("User already joined this tournament")
            if tournament.status != "open":
                raise RuntimeError("Tournament is not open for new entries")

            joined_count = len(tournament.participants)
            if joined_count >= tournament.max_players:
                tournament.status = "full"
                raise RuntimeError("Tournament is already full")

            if tournament.entry_fee_cents > 0:
                if user.wallet.balance_cents < tournament.entry_fee_cents:
                    raise ArithmeticError("Insufficient wallet balance for tournament entry")
                user.wallet.balance_cents -= tournament.entry_fee_cents
                session.add(
                    WalletTransactionORM(
                        id=create_id("wallettxn"),
                        wallet=user.wallet,
                        user=user,
                        type="entry_fee_debit",
                        amount_cents=tournament.entry_fee_cents,
                        balance_after_cents=user.wallet.balance_cents,
                        reference_type="tournament_entry",
                        reference_id=tournament_id,
                    )
                )

            tournament.participants.append(
                ParticipantORM(
                    id=create_id("participant"),
                    user_id=user_id,
                    status="registered",
                )
            )

            if len(tournament.participants) >= tournament.max_players:
                tournament.status = "full"

            session.flush()
            return self._to_user_record(user), self._to_tournament_record(tournament)

    def list_tournament_users(self, tournament_id: str) -> list[UserRecord]:
        with self.session_factory() as session:
            users = session.execute(
                select(UserORM)
                .join(ParticipantORM, ParticipantORM.user_id == UserORM.id)
                .where(ParticipantORM.tournament_id == tournament_id)
                .options(selectinload(UserORM.wallet))
                .order_by(UserORM.name.asc())
            ).scalars().all()
            return [self._to_user_record(user) for user in users if user is not None]
