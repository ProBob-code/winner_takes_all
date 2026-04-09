from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from secrets import token_hex

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import selectinload, sessionmaker

from .models import (
    MatchORM,
    NotificationORM,
    ParticipantORM,
    PaymentORM,
    SessionORM,
    TournamentORM,
    UserORM,
    WalletORM,
    WalletTransactionORM,
)
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
    platform_fee_percent: int = 7
    winner_id: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


@dataclass
class MatchRecord:
    id: str
    tournament_id: str
    round: int
    match_order: int
    player1_id: str | None
    player2_id: str | None
    winner_id: str | None
    room_code: str | None
    status: str
    score_threshold: int
    player1_score: int
    player2_score: int
    player1_submitted_score: int | None
    player2_submitted_score: int | None
    scores_approved: bool
    lifelines_used: dict | None
    scheduled_at: datetime | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    player1_name: str | None = None
    player2_name: str | None = None
    winner_name: str | None = None


@dataclass
class PaymentRecord:
    id: str
    user_id: str
    amount_cents: int
    currency: str
    provider: str
    provider_order_id: str | None
    provider_payment_id: str | None
    idempotency_key: str
    status: str
    created_at: datetime


@dataclass
class NotificationRecord:
    id: str
    user_id: str
    type: str
    title: str
    message: str
    tournament_id: str | None
    match_id: str | None
    read: bool
    created_at: datetime


@dataclass
class ParticipantRecord:
    id: str
    tournament_id: str
    user_id: str
    status: str
    seed: int | None
    total_score: int
    wins: int
    losses: int
    eliminated_in_round: int | None
    joined_at: datetime
    user_name: str | None = None


ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)


DEFAULT_TOURNAMENTS = [
    {
        "name": "Friday Knockout",
        "entry_fee_cents": 100000,
        "prize_pool_cents": 800000,
        "max_players": 8,
        "status": "open",
        "bracket_type": "single_elimination",
        "bracket_state": {
            "rounds": [
                {"name": "Quarterfinals", "matches": 4, "score_threshold": 40},
                {"name": "Semifinals", "matches": 2, "score_threshold": 50},
                {"name": "Final", "matches": 1, "score_threshold": 60},
            ]
        },
    },
    {
        "name": "Sunday Free Cup",
        "entry_fee_cents": 0,
        "prize_pool_cents": 250000,
        "max_players": 8,
        "status": "open",
        "bracket_type": "single_elimination",
        "bracket_state": {
            "rounds": [
                {"name": "Quarterfinals", "matches": 4, "score_threshold": 40},
                {"name": "Semifinals", "matches": 2, "score_threshold": 50},
                {"name": "Final", "matches": 1, "score_threshold": 60},
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

    # ── User operations ──

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

    # ── Wallet operations ──

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

    def list_wallet_entries(self, user_id: str) -> list[WalletEntryRecord]:
        with self.session_factory() as session:
            entries = session.execute(
                select(WalletTransactionORM)
                .where(WalletTransactionORM.user_id == user_id)
                .order_by(WalletTransactionORM.created_at.desc())
            ).scalars().all()
            return [self._to_wallet_entry_record(entry) for entry in entries]

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

    def credit_wallet(
        self,
        *,
        user_id: str,
        amount_cents: int,
        reference_type: str,
        reference_id: str,
        transaction_type: str = "deposit",
        payment_id: str | None = None,
    ) -> UserRecord:
        with self.session_factory.begin() as session:
            user = session.execute(
                select(UserORM)
                .where(UserORM.id == user_id)
                .options(selectinload(UserORM.wallet))
            ).scalar_one_or_none()
            if user is None or user.wallet is None:
                raise ValueError("User not found")

            user.wallet.balance_cents += amount_cents
            session.add(
                WalletTransactionORM(
                    id=create_id("wallettxn"),
                    wallet=user.wallet,
                    user=user,
                    type=transaction_type,
                    amount_cents=amount_cents,
                    balance_after_cents=user.wallet.balance_cents,
                    reference_type=reference_type,
                    reference_id=reference_id,
                    payment_id=payment_id,
                )
            )
            session.flush()
            return self._to_user_record(user)

    # ── Session operations ──

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

    # ── Tournament operations ──

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
            platform_fee_percent=tournament.platform_fee_percent,
            winner_id=tournament.winner_id,
            started_at=ensure_utc(tournament.started_at) if tournament.started_at else None,
            completed_at=ensure_utc(tournament.completed_at) if tournament.completed_at else None,
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

    def update_tournament_status(self, tournament_id: str, status: str, **kwargs) -> None:
        with self.session_factory.begin() as session:
            vals = {"status": status, **kwargs}
            session.execute(
                update(TournamentORM).where(TournamentORM.id == tournament_id).values(**vals)
            )

    def update_tournament_bracket_state(self, tournament_id: str, bracket_state: dict) -> None:
        with self.session_factory.begin() as session:
            session.execute(
                update(TournamentORM)
                .where(TournamentORM.id == tournament_id)
                .values(bracket_state=bracket_state)
            )

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
            if tournament.status not in ("open", "in_progress"):
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
                    seed=joined_count + 1,
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

    def get_participants(self, tournament_id: str) -> list[ParticipantRecord]:
        with self.session_factory() as session:
            participants = session.execute(
                select(ParticipantORM)
                .where(ParticipantORM.tournament_id == tournament_id)
                .options(selectinload(ParticipantORM.user))
                .order_by(ParticipantORM.seed.asc())
            ).scalars().all()
            return [
                ParticipantRecord(
                    id=p.id,
                    tournament_id=p.tournament_id,
                    user_id=p.user_id,
                    status=p.status,
                    seed=p.seed,
                    total_score=p.total_score,
                    wins=p.wins,
                    losses=p.losses,
                    eliminated_in_round=p.eliminated_in_round,
                    joined_at=ensure_utc(p.joined_at),
                    user_name=p.user.name if p.user else None,
                )
                for p in participants
            ]

    def update_participant(
        self, tournament_id: str, user_id: str, **kwargs
    ) -> None:
        with self.session_factory.begin() as session:
            session.execute(
                update(ParticipantORM)
                .where(
                    ParticipantORM.tournament_id == tournament_id,
                    ParticipantORM.user_id == user_id,
                )
                .values(**kwargs)
            )

    # ── Match operations ──

    def _to_match_record(self, match: MatchORM | None) -> MatchRecord | None:
        if match is None:
            return None
        return MatchRecord(
            id=match.id,
            tournament_id=match.tournament_id,
            round=match.round,
            match_order=match.match_order,
            player1_id=match.player1_id,
            player2_id=match.player2_id,
            winner_id=match.winner_id,
            room_code=match.room_code,
            status=match.status,
            score_threshold=match.score_threshold,
            player1_score=match.player1_score,
            player2_score=match.player2_score,
            player1_submitted_score=match.player1_submitted_score,
            player2_submitted_score=match.player2_submitted_score,
            scores_approved=match.scores_approved,
            lifelines_used=match.lifelines_used,
            scheduled_at=ensure_utc(match.scheduled_at) if match.scheduled_at else None,
            started_at=ensure_utc(match.started_at) if match.started_at else None,
            completed_at=ensure_utc(match.completed_at) if match.completed_at else None,
            created_at=ensure_utc(match.created_at),
            player1_name=match.player1.name if match.player1 else None,
            player2_name=match.player2.name if match.player2 else None,
            winner_name=None,
        )

    def create_match(
        self,
        *,
        tournament_id: str,
        round_num: int,
        match_order: int,
        player1_id: str | None = None,
        player2_id: str | None = None,
        score_threshold: int = 40,
        scheduled_at: datetime | None = None,
    ) -> MatchRecord:
        match = MatchORM(
            id=create_id("match"),
            tournament_id=tournament_id,
            round=round_num,
            match_order=match_order,
            player1_id=player1_id,
            player2_id=player2_id,
            score_threshold=score_threshold,
            room_code=create_id("room"),
            status="pending" if player1_id and player2_id else "waiting",
            scheduled_at=scheduled_at,
        )
        with self.session_factory.begin() as session:
            session.add(match)
            session.flush()
            return self._to_match_record(match)

    def get_match(self, match_id: str) -> MatchRecord | None:
        with self.session_factory() as session:
            match = session.execute(
                select(MatchORM)
                .where(MatchORM.id == match_id)
                .options(
                    selectinload(MatchORM.player1),
                    selectinload(MatchORM.player2),
                )
            ).scalar_one_or_none()
            return self._to_match_record(match)

    def list_matches_by_tournament(self, tournament_id: str) -> list[MatchRecord]:
        with self.session_factory() as session:
            matches = session.execute(
                select(MatchORM)
                .where(MatchORM.tournament_id == tournament_id)
                .options(
                    selectinload(MatchORM.player1),
                    selectinload(MatchORM.player2),
                )
                .order_by(MatchORM.round.asc(), MatchORM.match_order.asc())
            ).scalars().all()
            return [self._to_match_record(m) for m in matches if m is not None]

    def update_match(self, match_id: str, **kwargs) -> None:
        with self.session_factory.begin() as session:
            session.execute(
                update(MatchORM).where(MatchORM.id == match_id).values(**kwargs)
            )

    # ── Payment operations ──

    def _to_payment_record(self, payment: PaymentORM | None) -> PaymentRecord | None:
        if payment is None:
            return None
        return PaymentRecord(
            id=payment.id,
            user_id=payment.user_id,
            amount_cents=payment.amount_cents,
            currency=payment.currency,
            provider=payment.provider,
            provider_order_id=payment.provider_order_id,
            provider_payment_id=payment.provider_payment_id,
            idempotency_key=payment.idempotency_key,
            status=payment.status,
            created_at=ensure_utc(payment.created_at),
        )

    def create_payment(
        self,
        *,
        user_id: str,
        amount_cents: int,
        currency: str = "INR",
        provider_order_id: str | None = None,
        idempotency_key: str,
    ) -> PaymentRecord:
        payment = PaymentORM(
            id=create_id("payment"),
            user_id=user_id,
            amount_cents=amount_cents,
            currency=currency,
            provider="razorpay",
            provider_order_id=provider_order_id,
            idempotency_key=idempotency_key,
            status="pending",
        )
        with self.session_factory.begin() as session:
            session.add(payment)
            session.flush()
            return self._to_payment_record(payment)

    def get_payment(self, payment_id: str) -> PaymentRecord | None:
        with self.session_factory() as session:
            payment = session.execute(
                select(PaymentORM).where(PaymentORM.id == payment_id)
            ).scalar_one_or_none()
            return self._to_payment_record(payment)

    def get_payment_by_order_id(self, provider_order_id: str) -> PaymentRecord | None:
        with self.session_factory() as session:
            payment = session.execute(
                select(PaymentORM).where(PaymentORM.provider_order_id == provider_order_id)
            ).scalar_one_or_none()
            return self._to_payment_record(payment)

    def get_payment_by_idempotency_key(self, idempotency_key: str) -> PaymentRecord | None:
        with self.session_factory() as session:
            payment = session.execute(
                select(PaymentORM).where(PaymentORM.idempotency_key == idempotency_key)
            ).scalar_one_or_none()
            return self._to_payment_record(payment)

    def update_payment(self, payment_id: str, **kwargs) -> None:
        with self.session_factory.begin() as session:
            session.execute(
                update(PaymentORM).where(PaymentORM.id == payment_id).values(**kwargs)
            )

    # ── Notification operations ──

    def _to_notification_record(self, n: NotificationORM) -> NotificationRecord:
        return NotificationRecord(
            id=n.id,
            user_id=n.user_id,
            type=n.type,
            title=n.title,
            message=n.message,
            tournament_id=n.tournament_id,
            match_id=n.match_id,
            read=n.read,
            created_at=ensure_utc(n.created_at),
        )

    def create_notification(
        self,
        *,
        user_id: str,
        type: str,
        title: str,
        message: str,
        tournament_id: str | None = None,
        match_id: str | None = None,
    ) -> NotificationRecord:
        notification = NotificationORM(
            id=create_id("notif"),
            user_id=user_id,
            type=type,
            title=title,
            message=message,
            tournament_id=tournament_id,
            match_id=match_id,
        )
        with self.session_factory.begin() as session:
            session.add(notification)
            session.flush()
            return self._to_notification_record(notification)

    def list_notifications(self, user_id: str, limit: int = 20) -> list[NotificationRecord]:
        with self.session_factory() as session:
            notifications = session.execute(
                select(NotificationORM)
                .where(NotificationORM.user_id == user_id)
                .order_by(NotificationORM.created_at.desc())
                .limit(limit)
            ).scalars().all()
            return [self._to_notification_record(n) for n in notifications]

    def count_unread_notifications(self, user_id: str) -> int:
        with self.session_factory() as session:
            return session.scalar(
                select(func.count(NotificationORM.id))
                .where(NotificationORM.user_id == user_id, NotificationORM.read == False)  # noqa: E712
            ) or 0

    def mark_notification_read(self, notification_id: str) -> None:
        with self.session_factory.begin() as session:
            session.execute(
                update(NotificationORM)
                .where(NotificationORM.id == notification_id)
                .values(read=True)
            )

    # ── Stats operations ──

    def get_user_match_stats(self, user_id: str) -> dict:
        with self.session_factory() as session:
            wins = session.scalar(
                select(func.count(MatchORM.id))
                .where(MatchORM.winner_id == user_id, MatchORM.scores_approved == True)  # noqa: E712
            ) or 0
            total_as_p1 = session.scalar(
                select(func.count(MatchORM.id))
                .where(MatchORM.player1_id == user_id, MatchORM.scores_approved == True)  # noqa: E712
            ) or 0
            total_as_p2 = session.scalar(
                select(func.count(MatchORM.id))
                .where(MatchORM.player2_id == user_id, MatchORM.scores_approved == True)  # noqa: E712
            ) or 0
            total_played = total_as_p1 + total_as_p2
            losses = total_played - wins

            # Sum of scores
            score_as_p1 = session.scalar(
                select(func.coalesce(func.sum(MatchORM.player1_score), 0))
                .where(MatchORM.player1_id == user_id, MatchORM.scores_approved == True)  # noqa: E712
            ) or 0
            score_as_p2 = session.scalar(
                select(func.coalesce(func.sum(MatchORM.player2_score), 0))
                .where(MatchORM.player2_id == user_id, MatchORM.scores_approved == True)  # noqa: E712
            ) or 0

            # Sum of payout earnings
            earnings = session.scalar(
                select(func.coalesce(func.sum(WalletTransactionORM.amount_cents), 0))
                .where(
                    WalletTransactionORM.user_id == user_id,
                    WalletTransactionORM.type == "tournament_payout",
                )
            ) or 0

            return {
                "wins": wins,
                "losses": losses,
                "total_score": score_as_p1 + score_as_p2,
                "points": wins * 3,
                "earnings_cents": earnings,
            }
