from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Boolean
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def utc_timestamp() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class UserORM(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(60))
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="player")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_timestamp,
        onupdate=utc_timestamp,
    )

    wallet: Mapped["WalletORM"] = relationship(
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    wallet_transactions: Mapped[list["WalletTransactionORM"]] = relationship(back_populates="user")
    payments: Mapped[list["PaymentORM"]] = relationship(back_populates="user")
    sessions: Mapped[list["SessionORM"]] = relationship(back_populates="user")
    participants: Mapped[list["ParticipantORM"]] = relationship(back_populates="user")
    notifications: Mapped[list["NotificationORM"]] = relationship(back_populates="user")


class WalletORM(Base):
    __tablename__ = "wallets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    balance_cents: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_timestamp,
        onupdate=utc_timestamp,
    )

    user: Mapped[UserORM] = relationship(back_populates="wallet")
    transactions: Mapped[list["WalletTransactionORM"]] = relationship(back_populates="wallet")


class TournamentORM(Base):
    __tablename__ = "tournaments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    entry_fee_cents: Mapped[int] = mapped_column(Integer, default=0)
    prize_pool_cents: Mapped[int] = mapped_column(Integer, default=0)
    max_players: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    bracket_type: Mapped[str] = mapped_column(String(40), default="single_elimination")
    bracket_state: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    platform_fee_percent: Mapped[int] = mapped_column(Integer, default=7)
    winner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_timestamp,
        onupdate=utc_timestamp,
    )

    participants: Mapped[list["ParticipantORM"]] = relationship(
        back_populates="tournament",
        cascade="all, delete-orphan",
    )
    matches: Mapped[list["MatchORM"]] = relationship(back_populates="tournament")


class ParticipantORM(Base):
    __tablename__ = "participants"
    __table_args__ = (UniqueConstraint("tournament_id", "user_id", name="uq_participants_tournament_user"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tournament_id: Mapped[str] = mapped_column(ForeignKey("tournaments.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="registered")
    seed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    wins: Mapped[int] = mapped_column(Integer, default=0)
    losses: Mapped[int] = mapped_column(Integer, default=0)
    eliminated_in_round: Mapped[int | None] = mapped_column(Integer, nullable=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)

    tournament: Mapped[TournamentORM] = relationship(back_populates="participants")
    user: Mapped[UserORM] = relationship(back_populates="participants")


class MatchORM(Base):
    __tablename__ = "matches"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    tournament_id: Mapped[str] = mapped_column(ForeignKey("tournaments.id", ondelete="CASCADE"), index=True)
    round: Mapped[int] = mapped_column(Integer, default=1)
    match_order: Mapped[int] = mapped_column(Integer, default=0)
    player1_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    player2_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    winner_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    room_code: Mapped[str | None] = mapped_column(String(80), unique=True, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    score_threshold: Mapped[int] = mapped_column(Integer, default=40)
    player1_score: Mapped[int] = mapped_column(Integer, default=0)
    player2_score: Mapped[int] = mapped_column(Integer, default=0)
    player1_submitted_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    player2_submitted_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scores_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    lifelines_used: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    result_meta: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)

    tournament: Mapped[TournamentORM] = relationship(back_populates="matches")
    player1: Mapped[UserORM | None] = relationship(foreign_keys=[player1_id])
    player2: Mapped[UserORM | None] = relationship(foreign_keys=[player2_id])


class PaymentORM(Base):
    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(10), default="INR")
    provider: Mapped[str] = mapped_column(String(40), default="razorpay")
    provider_order_id: Mapped[str | None] = mapped_column(String(120), unique=True, nullable=True)
    provider_payment_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    provider_signature: Mapped[str | None] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    metadata_json: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_timestamp,
        onupdate=utc_timestamp,
    )

    user: Mapped[UserORM] = relationship(back_populates="payments")


class SessionORM(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    token: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)

    user: Mapped[UserORM] = relationship(back_populates="sessions")


class WalletTransactionORM(Base):
    __tablename__ = "wallet_transactions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    wallet_id: Mapped[str] = mapped_column(ForeignKey("wallets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    payment_id: Mapped[str | None] = mapped_column(ForeignKey("payments.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(40))
    amount_cents: Mapped[int] = mapped_column(Integer)
    balance_after_cents: Mapped[int] = mapped_column(Integer)
    reference_type: Mapped[str] = mapped_column(String(40))
    reference_id: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)

    wallet: Mapped[WalletORM] = relationship(back_populates="transactions")
    user: Mapped[UserORM] = relationship(back_populates="wallet_transactions")


class NotificationORM(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(40))
    title: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(Text)
    tournament_id: Mapped[str | None] = mapped_column(ForeignKey("tournaments.id"), nullable=True)
    match_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_timestamp)

    user: Mapped[UserORM] = relationship(back_populates="notifications")
