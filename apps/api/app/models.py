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
MatchStatus = Literal["waiting", "pending", "in_progress", "score_submitted", "completed"]
ParticipantStatus = Literal["registered", "active", "eliminated", "winner"]


class Money(BaseModel):
    amount: str
    currency: Currency = "INR"


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


class WalletTopupRequest(BaseModel):
    amount: int = Field(gt=0, description="Amount in INR (rupees, not paise)")
    idempotencyKey: str | None = None


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
    platformFeePercent: int = 7
    winnerId: str | None = None
    startedAt: datetime | None = None
    completedAt: datetime | None = None


class MatchPlayer(BaseModel):
    id: str
    name: str
    score: int = 0
    submittedScore: int | None = None


class MatchDetail(BaseModel):
    id: str
    tournamentId: str
    round: int
    matchOrder: int
    player1: MatchPlayer | None = None
    player2: MatchPlayer | None = None
    winnerId: str | None = None
    roomCode: str | None = None
    status: str
    scoreThreshold: int
    scoresApproved: bool
    lifelinesUsed: dict | None = None
    scheduledAt: datetime | None = None
    startedAt: datetime | None = None
    completedAt: datetime | None = None


class ScoreSubmitRequest(BaseModel):
    score: int = Field(ge=0)


class ScoreApproveRequest(BaseModel):
    matchId: str


class BracketRound(BaseModel):
    name: str
    roundNumber: int
    scoreThreshold: int
    matches: list[MatchDetail]


class BracketResponse(BaseModel):
    ok: bool = True
    tournamentId: str
    tournamentName: str
    status: str
    rounds: list[BracketRound]


class ParticipantDetail(BaseModel):
    userId: str
    displayName: str
    status: str
    seed: int | None = None
    totalScore: int = 0
    wins: int = 0
    losses: int = 0
    eliminatedInRound: int | None = None


class LeaderboardEntry(BaseModel):
    userId: str
    displayName: str
    wins: int
    losses: int
    points: int = 0
    totalScore: int = 0
    earnings: Money
    status: str = "active"


class NotificationItem(BaseModel):
    id: str
    type: str
    title: str
    message: str
    tournamentId: str | None = None
    matchId: str | None = None
    read: bool
    createdAt: datetime


class PaymentOrderResponse(BaseModel):
    ok: bool = True
    orderId: str
    razorpayOrderId: str
    amount: int
    currency: str = "INR"
    keyId: str


class PaymentVerifyRequest(BaseModel):
    razorpayOrderId: str
    razorpayPaymentId: str
    razorpaySignature: str


# ── Response wrappers ──

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


class MatchResponse(BaseModel):
    ok: bool = True
    match: MatchDetail


class MatchesResponse(BaseModel):
    ok: bool = True
    matches: list[MatchDetail]


class LeaderboardResponse(BaseModel):
    ok: bool = True
    entries: list[LeaderboardEntry]


class NotificationsResponse(BaseModel):
    ok: bool = True
    notifications: list[NotificationItem]
    unreadCount: int = 0


class ParticipantsResponse(BaseModel):
    ok: bool = True
    participants: list[ParticipantDetail]
