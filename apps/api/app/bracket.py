"""Bracket generation engine for single-elimination tournaments."""

from __future__ import annotations

import math
from datetime import datetime, timedelta, timezone

from .db import SQLAlchemyRepository, create_id, utcnow


# Score thresholds increase per round
ROUND_THRESHOLDS = {
    1: 40,   # Round of 16 / Quarterfinals
    2: 50,   # Semifinals
    3: 60,   # Final
    4: 60,
}

ROUND_NAMES = {
    # Keyed by (total_rounds, current_round_1_indexed)
    (3, 1): "Quarterfinals",
    (3, 2): "Semifinals",
    (3, 3): "Final",
    (2, 1): "Semifinals",
    (2, 2): "Final",
    (1, 1): "Final",
    (4, 1): "Round of 16",
    (4, 2): "Quarterfinals",
    (4, 3): "Semifinals",
    (4, 4): "Final",
}


def get_round_name(total_rounds: int, round_number: int) -> str:
    return ROUND_NAMES.get((total_rounds, round_number), f"Round {round_number}")


def get_score_threshold(round_number: int) -> int:
    return ROUND_THRESHOLDS.get(round_number, 60)


def generate_bracket(
    store: SQLAlchemyRepository,
    tournament_id: str,
    participant_ids: list[str],
) -> dict:
    """Generate a single-elimination bracket and create Match records.

    Returns the bracket_state dict to be stored on the tournament.
    """
    num_players = len(participant_ids)
    if num_players < 2:
        raise ValueError("Need at least 2 participants to generate a bracket")

    # Calculate rounds
    total_rounds = math.ceil(math.log2(num_players))
    bracket_size = 2 ** total_rounds

    # Pad with byes if not a power of 2
    padded: list[str | None] = [p for p in participant_ids]
    while len(padded) < bracket_size:
        padded.append(None)  # BYE

    now = utcnow()
    rounds_data = []

    # Create round 1 matches
    round1_matches = []
    num_r1_matches = bracket_size // 2

    for i in range(num_r1_matches):
        p1_id = padded[i]
        p2_id = padded[bracket_size - 1 - i]  # Classic seeding fold

        threshold = get_score_threshold(1)
        scheduled = now + timedelta(minutes=5 * (i + 1))

        # If one player is a BYE, auto-advance
        if p1_id is None and p2_id is None:
            continue

        is_bye = p1_id is None or p2_id is None
        status = "bye" if is_bye else "pending"
        winner = p1_id if p2_id is None else (p2_id if p1_id is None else None)

        match_record = store.create_match(
            tournament_id=tournament_id,
            round_num=1,
            match_order=i,
            player1_id=p1_id,
            player2_id=p2_id,
            score_threshold=threshold,
            scheduled_at=scheduled,
        )

        if is_bye and winner:
            store.update_match(
                match_record.id,
                status="completed",
                winner_id=winner,
                scores_approved=True,
                completed_at=now,
            )

        round1_matches.append({
            "matchId": match_record.id,
            "player1Id": p1_id,
            "player2Id": p2_id,
            "winnerId": winner,
            "status": status,
            "scoreThreshold": threshold,
        })

    round_name = get_round_name(total_rounds, 1)
    rounds_data.append({
        "name": round_name,
        "roundNumber": 1,
        "scoreThreshold": get_score_threshold(1),
        "matches": round1_matches,
    })

    # Create placeholder matches for subsequent rounds
    prev_match_count = num_r1_matches
    for r in range(2, total_rounds + 1):
        round_matches = []
        num_matches = prev_match_count // 2
        threshold = get_score_threshold(r)
        round_name = get_round_name(total_rounds, r)

        for i in range(num_matches):
            scheduled = now + timedelta(hours=r - 1, minutes=5 * (i + 1))
            match_record = store.create_match(
                tournament_id=tournament_id,
                round_num=r,
                match_order=i,
                player1_id=None,
                player2_id=None,
                score_threshold=threshold,
                scheduled_at=scheduled,
            )
            round_matches.append({
                "matchId": match_record.id,
                "player1Id": None,
                "player2Id": None,
                "winnerId": None,
                "status": "waiting",
                "scoreThreshold": threshold,
            })

        rounds_data.append({
            "name": round_name,
            "roundNumber": r,
            "scoreThreshold": threshold,
            "matches": round_matches,
        })
        prev_match_count = num_matches

    # Auto-advance BYE winners into round 2
    _advance_byes(store, tournament_id, rounds_data)

    bracket_state = {"rounds": rounds_data, "totalRounds": total_rounds}
    store.update_tournament_bracket_state(tournament_id, bracket_state)
    return bracket_state


def _advance_byes(
    store: SQLAlchemyRepository,
    tournament_id: str,
    rounds_data: list[dict],
) -> None:
    """If round 1 has BYE wins, advance those winners into round 2 slots."""
    if len(rounds_data) < 2:
        return

    r1 = rounds_data[0]
    r2 = rounds_data[1]

    for i, match in enumerate(r1["matches"]):
        if match["status"] == "bye" and match["winnerId"]:
            # This match's winner goes to round2 match at index i//2
            target_idx = i // 2
            if target_idx < len(r2["matches"]):
                target_match = r2["matches"][target_idx]
                # Put winner in the appropriate slot
                if i % 2 == 0:
                    store.update_match(target_match["matchId"], player1_id=match["winnerId"])
                    target_match["player1Id"] = match["winnerId"]
                else:
                    store.update_match(target_match["matchId"], player2_id=match["winnerId"])
                    target_match["player2Id"] = match["winnerId"]

                # If both slots filled, mark as pending
                if target_match["player1Id"] and target_match["player2Id"]:
                    store.update_match(target_match["matchId"], status="pending")
                    target_match["status"] = "pending"


def advance_winner_in_bracket(
    store: SQLAlchemyRepository,
    tournament_id: str,
    completed_match_id: str,
    winner_id: str,
) -> dict | None:
    """After a match is completed, advance the winner to the next round.

    Returns updated bracket_state or None if tournament is complete.
    """
    tournament = store.get_tournament(tournament_id)
    if not tournament or not tournament.bracket_state:
        return None

    bracket_state = tournament.bracket_state
    rounds = bracket_state.get("rounds", [])

    # Find the completed match in the bracket
    completed_round_idx = None
    completed_match_idx = None

    for ri, round_data in enumerate(rounds):
        for mi, match_data in enumerate(round_data["matches"]):
            if match_data["matchId"] == completed_match_id:
                completed_round_idx = ri
                completed_match_idx = mi
                match_data["winnerId"] = winner_id
                match_data["status"] = "completed"
                break
        if completed_round_idx is not None:
            break

    if completed_round_idx is None or completed_match_idx is None:
        return bracket_state

    # Check if this was the final round
    assert completed_round_idx is not None
    next_round_idx = completed_round_idx + 1
    if next_round_idx >= len(rounds):
        # Tournament is complete — this was the final
        return bracket_state

    # Advance winner to next round
    next_round = rounds[next_round_idx]
    target_match_idx = cast(int, completed_match_idx) // 2

    if target_match_idx < len(next_round["matches"]):
        target_match = next_round["matches"][target_match_idx]

        if cast(int, completed_match_idx) % 2 == 0:
            store.update_match(target_match["matchId"], player1_id=winner_id)
            target_match["player1Id"] = winner_id
        else:
            store.update_match(target_match["matchId"], player2_id=winner_id)
            target_match["player2Id"] = winner_id

        # If both slots filled, mark as pending
        if target_match["player1Id"] and target_match["player2Id"]:
            store.update_match(target_match["matchId"], status="pending")
            target_match["status"] = "pending"

    store.update_tournament_bracket_state(tournament_id, bracket_state)
    return bracket_state


def is_tournament_complete(bracket_state: dict) -> tuple[bool, str | None]:
    """Check if all rounds are complete. Return (is_complete, winner_id)."""
    rounds = bracket_state.get("rounds", [])
    if not rounds:
        return False, None

    final_round = rounds[-1]
    for match in final_round["matches"]:
        if match.get("status") != "completed" or not match.get("winnerId"):
            return False, None

    # Tournament is complete — the final match winner is the tournament winner
    winner_id = final_round["matches"][0].get("winnerId")
    return True, winner_id
