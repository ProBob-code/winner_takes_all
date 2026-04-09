from __future__ import annotations

import os
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, Response

from .models import (
    BracketResponse,
    BracketRound,
    LeaderboardEntry,
    MatchDetail,
    MatchPlayer,
    Money,
    NotificationItem,
    ParticipantDetail,
    TournamentDetail,
    TournamentSummary,
    UserProfile,
    WalletSnapshot,
    WalletTransaction,
)
from .db import (
    ACCESS_TTL,
    REFRESH_TTL,
    MatchRecord,
    SQLAlchemyRepository,
    TournamentRecord,
    UserRecord,
    create_id,
    utcnow,
)
from .security import hash_password, verify_password
from .bracket import generate_bracket, advance_winner_in_bracket, is_tournament_complete


ACCESS_COOKIE = "wta_access_token"
REFRESH_COOKIE = "wta_refresh_token"
CURRENCY = "INR"


def cents_to_money(cents: int, currency: str = CURRENCY) -> Money:
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

    # ── Serialization helpers ──

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
            platformFeePercent=tournament.platform_fee_percent,
            winnerId=tournament.winner_id,
            startedAt=tournament.started_at,
            completedAt=tournament.completed_at,
        )

    def serialize_match(self, match: MatchRecord) -> MatchDetail:
        p1 = None
        p2 = None
        if match.player1_id:
            user = self.store.get_user_by_id(match.player1_id)
            p1 = MatchPlayer(
                id=match.player1_id,
                name=user.name if user else "TBD",
                score=match.player1_score,
                submittedScore=match.player1_submitted_score,
            )
        if match.player2_id:
            user = self.store.get_user_by_id(match.player2_id)
            p2 = MatchPlayer(
                id=match.player2_id,
                name=user.name if user else "TBD",
                score=match.player2_score,
                submittedScore=match.player2_submitted_score,
            )

        return MatchDetail(
            id=match.id,
            tournamentId=match.tournament_id,
            round=match.round,
            matchOrder=match.match_order,
            player1=p1,
            player2=p2,
            winnerId=match.winner_id,
            roomCode=match.room_code,
            status=match.status,
            scoreThreshold=match.score_threshold,
            scoresApproved=match.scores_approved,
            lifelinesUsed=match.lifelines_used,
            scheduledAt=match.scheduled_at,
            startedAt=match.started_at,
            completedAt=match.completed_at,
        )

    # ── Auth ──

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
            bonus_cents=250000,  # ₹2,500.00 signup bonus
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

    # ── Wallet ──

    def wallet_snapshot(self, user: UserRecord) -> WalletSnapshot:
        return self.serialize_wallet(user)

    def deduct_from_wallet(self, user: UserRecord, amount: str, reference_type: str, reference_id: str) -> WalletSnapshot:
        amount_cents = money_to_cents(amount)
        try:
            updated_user = self.store.deduct_wallet(
                user_id=user.id, amount_cents=amount_cents,
                reference_type=reference_type, reference_id=reference_id,
            )
        except ValueError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        return self.serialize_wallet(updated_user)

    # ── Tournaments ──

    def list_tournaments(self) -> list[TournamentSummary]:
        return [self.serialize_tournament_summary(t) for t in self.store.list_tournaments()]

    def get_tournament(self, tournament_id: str) -> TournamentDetail:
        tournament = self.store.get_tournament(tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")
        return self.serialize_tournament_detail(tournament)

    def join_tournament(self, user: UserRecord, tournament_id: str) -> tuple[TournamentDetail, WalletSnapshot]:
        try:
            updated_user, tournament = self.store.join_tournament(
                user_id=user.id, tournament_id=tournament_id,
            )
        except LookupError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ArithmeticError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except RuntimeError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error

        # Check if tournament is now full — auto-start bracket
        if tournament.status == "full":
            self._auto_start_tournament(tournament_id)
            tournament = self.store.get_tournament(tournament_id)

        return self.serialize_tournament_detail(tournament), self.serialize_wallet(updated_user)

    def _auto_start_tournament(self, tournament_id: str) -> None:
        """Auto-generate bracket when tournament fills up."""
        tournament = self.store.get_tournament(tournament_id)
        if not tournament or tournament.status not in ("full",):
            return

        participants = self.store.get_participants(tournament_id)
        participant_ids = [p.user_id for p in participants]

        # Update all participants to active
        for p in participants:
            self.store.update_participant(tournament_id, p.user_id, status="active")

        # Generate bracket
        bracket_state = generate_bracket(self.store, tournament_id, participant_ids)

        # Update tournament status
        self.store.update_tournament_status(
            tournament_id, "in_progress", started_at=utcnow()
        )

        # Notify all participants
        for p in participants:
            self.store.create_notification(
                user_id=p.user_id,
                type="tournament_started",
                title="Tournament Started! 🏆",
                message=f"{tournament.name} has started! Check the bracket for your first match.",
                tournament_id=tournament_id,
            )

    # ── Bracket ──

    def get_bracket(self, tournament_id: str) -> BracketResponse:
        tournament = self.store.get_tournament(tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")

        matches = self.store.list_matches_by_tournament(tournament_id)

        # Group matches by round
        rounds_map: dict[int, list[MatchDetail]] = {}
        for m in matches:
            serialized = self.serialize_match(m)
            rounds_map.setdefault(m.round, []).append(serialized)

        bracket_state = tournament.bracket_state or {}
        rounds_config = bracket_state.get("rounds", [])

        rounds = []
        for round_data in rounds_config:
            round_num = round_data.get("roundNumber", 1)
            rounds.append(BracketRound(
                name=round_data.get("name", f"Round {round_num}"),
                roundNumber=round_num,
                scoreThreshold=round_data.get("scoreThreshold", 40),
                matches=rounds_map.get(round_num, []),
            ))

        # If no rounds config, build from matches
        if not rounds:
            for round_num in sorted(rounds_map.keys()):
                from .bracket import get_round_name, get_score_threshold
                total_rounds = max(rounds_map.keys()) if rounds_map else 1
                rounds.append(BracketRound(
                    name=get_round_name(total_rounds, round_num),
                    roundNumber=round_num,
                    scoreThreshold=get_score_threshold(round_num),
                    matches=rounds_map[round_num],
                ))

        return BracketResponse(
            tournamentId=tournament_id,
            tournamentName=tournament.name,
            status=tournament.status,
            rounds=rounds,
        )

    # ── Matches ──

    def get_match_detail(self, match_id: str) -> MatchDetail:
        match = self.store.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        return self.serialize_match(match)

    def start_match(self, match_id: str) -> MatchDetail:
        match = self.store.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")
        if match.status not in ("pending", "waiting"):
            raise HTTPException(status_code=409, detail="Match cannot be started")

        self.store.update_match(match_id, status="in_progress", started_at=utcnow())
        return self.get_match_detail(match_id)

    def submit_score(self, match_id: str, user_id: str, score: int) -> MatchDetail:
        """Team submits their score after playing."""
        match = self.store.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        if match.player1_id == user_id:
            self.store.update_match(match_id, player1_submitted_score=score, player1_score=score)
        elif match.player2_id == user_id:
            self.store.update_match(match_id, player2_submitted_score=score, player2_score=score)
        else:
            raise HTTPException(status_code=403, detail="You are not a player in this match")

        # Check if both scores submitted
        updated = self.store.get_match(match_id)
        if updated.player1_submitted_score is not None and updated.player2_submitted_score is not None:
            self.store.update_match(match_id, status="score_submitted")

        return self.get_match_detail(match_id)

    def approve_scores(self, match_id: str, approver: UserRecord) -> MatchDetail:
        """Host/admin approves submitted scores and triggers bracket advancement."""
        match = self.store.get_match(match_id)
        if not match:
            raise HTTPException(status_code=404, detail="Match not found")

        if match.player1_submitted_score is None or match.player2_submitted_score is None:
            raise HTTPException(status_code=409, detail="Both players must submit scores first")

        # Determine winner based on scores
        p1_score = match.player1_submitted_score
        p2_score = match.player2_submitted_score

        if p1_score > p2_score:
            winner_id = match.player1_id
            loser_id = match.player2_id
        elif p2_score > p1_score:
            winner_id = match.player2_id
            loser_id = match.player1_id
        else:
            # Tie — higher submitted score wins, or p1 by default
            winner_id = match.player1_id
            loser_id = match.player2_id

        self.store.update_match(
            match_id,
            winner_id=winner_id,
            scores_approved=True,
            status="completed",
            completed_at=utcnow(),
            player1_score=p1_score,
            player2_score=p2_score,
        )

        # Update participant stats
        tournament = self.store.get_tournament(match.tournament_id)
        if winner_id:
            self.store.update_participant(
                match.tournament_id, winner_id,
                wins=self.store.get_user_match_stats(winner_id)["wins"] + 1,
                total_score=self.store.get_user_match_stats(winner_id)["total_score"] + (p1_score if winner_id == match.player1_id else p2_score),
            )
        if loser_id:
            self.store.update_participant(
                match.tournament_id, loser_id,
                status="eliminated",
                losses=self.store.get_user_match_stats(loser_id)["losses"] + 1,
                eliminated_in_round=match.round,
                total_score=self.store.get_user_match_stats(loser_id)["total_score"] + (p2_score if loser_id == match.player2_id else p1_score),
            )

            # Notify eliminated player
            self.store.create_notification(
                user_id=loser_id,
                type="eliminated",
                title="Eliminated 😔",
                message=f"You've been eliminated in {tournament.name} (Round {match.round}).",
                tournament_id=match.tournament_id,
                match_id=match_id,
            )

        # Advance winner in bracket
        bracket_state = advance_winner_in_bracket(
            self.store, match.tournament_id, match_id, winner_id
        )

        # Check if tournament is complete
        if bracket_state:
            complete, final_winner_id = is_tournament_complete(bracket_state)
            if complete and final_winner_id:
                self._complete_tournament(match.tournament_id, final_winner_id)

        # Notify winner about advancement
        if winner_id:
            self.store.create_notification(
                user_id=winner_id,
                type="match_won",
                title="Match Won! 🎉",
                message=f"You won your Round {match.round} match! Check the bracket for your next opponent.",
                tournament_id=match.tournament_id,
                match_id=match_id,
            )

        return self.get_match_detail(match_id)

    def _complete_tournament(self, tournament_id: str, winner_id: str) -> None:
        """Complete tournament, calculate and distribute payout."""
        tournament = self.store.get_tournament(tournament_id)
        if not tournament:
            return

        # Calculate payout: prize_pool × (1 - platform_fee%)
        fee_percent = tournament.platform_fee_percent or 7
        payout_cents = int(tournament.prize_pool_cents * (100 - fee_percent) / 100)

        # Credit winner's wallet
        self.store.credit_wallet(
            user_id=winner_id,
            amount_cents=payout_cents,
            reference_type="tournament_payout",
            reference_id=tournament_id,
            transaction_type="tournament_payout",
        )

        # Update winner participant status
        self.store.update_participant(tournament_id, winner_id, status="winner")

        # Update tournament
        self.store.update_tournament_status(
            tournament_id,
            "completed",
            winner_id=winner_id,
            completed_at=utcnow(),
        )

        # Notify all participants
        participants = self.store.get_participants(tournament_id)
        winner_user = self.store.get_user_by_id(winner_id)
        winner_name = winner_user.name if winner_user else "Unknown"

        for p in participants:
            if p.user_id == winner_id:
                self.store.create_notification(
                    user_id=p.user_id,
                    type="tournament_won",
                    title="🏆 CHAMPION! 🏆",
                    message=f"You won {tournament.name}! ₹{payout_cents/100:.2f} has been credited to your wallet!",
                    tournament_id=tournament_id,
                )
            else:
                self.store.create_notification(
                    user_id=p.user_id,
                    type="tournament_completed",
                    title="Tournament Complete",
                    message=f"{tournament.name} has ended. Winner: {winner_name}. Thanks for playing!",
                    tournament_id=tournament_id,
                )

    # ── Leaderboard ──

    def global_leaderboard(self) -> list[LeaderboardEntry]:
        users = self.store.list_users()
        entries = []
        for user in users:
            stats = self.store.get_user_match_stats(user.id)
            entries.append(LeaderboardEntry(
                userId=user.id,
                displayName=user.name,
                wins=stats["wins"],
                losses=stats["losses"],
                points=stats["points"],
                totalScore=stats["total_score"],
                earnings=cents_to_money(stats["earnings_cents"]),
                status="active",
            ))
        entries.sort(key=lambda e: (-e.points, -e.totalScore, -e.wins))
        return entries

    def tournament_leaderboard(self, tournament_id: str) -> list[LeaderboardEntry]:
        tournament = self.store.get_tournament(tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")

        participants = self.store.get_participants(tournament_id)
        entries = []
        for p in participants:
            stats = self.store.get_user_match_stats(p.user_id)
            entries.append(LeaderboardEntry(
                userId=p.user_id,
                displayName=p.user_name or "Unknown",
                wins=p.wins,
                losses=p.losses,
                points=p.wins * 3,
                totalScore=p.total_score,
                earnings=cents_to_money(stats["earnings_cents"]),
                status=p.status,
            ))
        # Winners first, then by score
        status_order = {"winner": 0, "active": 1, "registered": 2, "eliminated": 3}
        entries.sort(key=lambda e: (status_order.get(e.status, 9), -e.totalScore, -e.wins))
        return entries

    def get_participants(self, tournament_id: str) -> list[ParticipantDetail]:
        tournament = self.store.get_tournament(tournament_id)
        if not tournament:
            raise HTTPException(status_code=404, detail="Tournament not found")

        participants = self.store.get_participants(tournament_id)
        return [
            ParticipantDetail(
                userId=p.user_id,
                displayName=p.user_name or "Unknown",
                status=p.status,
                seed=p.seed,
                totalScore=p.total_score,
                wins=p.wins,
                losses=p.losses,
                eliminatedInRound=p.eliminated_in_round,
            )
            for p in participants
        ]

    # ── Notifications ──

    def get_notifications(self, user_id: str) -> tuple[list[NotificationItem], int]:
        notifications = self.store.list_notifications(user_id)
        unread = self.store.count_unread_notifications(user_id)
        items = [
            NotificationItem(
                id=n.id,
                type=n.type,
                title=n.title,
                message=n.message,
                tournamentId=n.tournament_id,
                matchId=n.match_id,
                read=n.read,
                createdAt=n.created_at,
            )
            for n in notifications
        ]
        return items, unread

    def mark_notification_read(self, notification_id: str) -> None:
        self.store.mark_notification_read(notification_id)

    # ── Admin ──

    def get_admin_overview(self) -> dict:
        tournaments = self.store.list_tournaments()
        all_matches = []
        pending_approvals = []
        for t in tournaments:
            matches = self.store.list_matches_by_tournament(t.id)
            for m in matches:
                all_matches.append(m)
                if m.status == "score_submitted" and not m.scores_approved:
                    pending_approvals.append(self.serialize_match(m))

        return {
            "totalTournaments": len(tournaments),
            "activeTournaments": len([t for t in tournaments if t.status == "in_progress"]),
            "completedTournaments": len([t for t in tournaments if t.status == "completed"]),
            "totalMatches": len(all_matches),
            "activeMatches": len([m for m in all_matches if m.status == "in_progress"]),
            "pendingApprovals": [a.model_dump() for a in pending_approvals],
            "tournaments": [self.serialize_tournament_summary(t).model_dump() for t in tournaments],
        }
