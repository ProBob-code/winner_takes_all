from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Currency = Literal["USD", "INR"]
UserRole = Literal["player", "admin"]
WalletTransactionType = Literal[
    "deposit",
    "entry_fee_debit",
    "tournament_payout",
    "refund",
    "manual_adjustment",
]
TournamentStatus = Literal[
    "draft",
    "open",
    "full",
    "in_progress",
    "completed",
    "cancelled",
]
BracketType = Literal["single_elimination", "double_elimination"]


class Money(BaseModel):
    amount: str
    currency: Currency


class UserProfile(BaseModel):
    id: str
    name: str
    email: str
    walletBalance: str
    role: UserRole


class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=72)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=8, max_length=72)


class RefreshRequest(BaseModel):
    refreshToken: str | None = None


class WalletDeductRequest(BaseModel):
    amount: str
    referenceType: str = Field(min_length=2, max_length=40)
    referenceId: str = Field(min_length=2, max_length=80)


class WalletTransaction(BaseModel):
    id: str
    type: WalletTransactionType
    amount: Money
    createdAt: datetime
    referenceType: str
    referenceId: str


class WalletSnapshot(BaseModel):
    balance: Money
    transactions: list[WalletTransaction]


class TournamentSummary(BaseModel):
    id: str
    name: str
    entryFee: Money
    maxPlayers: int
    joinedPlayers: int
    status: TournamentStatus


class TournamentDetail(TournamentSummary):
    prizePool: Money
    bracketType: BracketType
    bracketState: dict | None = None


class LeaderboardEntry(BaseModel):
    userId: str
    displayName: str
    wins: int
    losses: int
    earnings: Money


class AuthResponse(BaseModel):
    ok: bool = True
    user: UserProfile


class ErrorResponse(BaseModel):
    ok: bool = False
    message: str


class WalletResponse(BaseModel):
    ok: bool = True
    wallet: WalletSnapshot


class TournamentsResponse(BaseModel):
    ok: bool = True
    tournaments: list[TournamentSummary]


class TournamentResponse(BaseModel):
    ok: bool = True
    tournament: TournamentDetail


class TournamentJoinResponse(BaseModel):
    ok: bool = True
    tournament: TournamentDetail
    wallet: WalletSnapshot


class LeaderboardResponse(BaseModel):
    ok: bool = True
    entries: list[LeaderboardEntry]
