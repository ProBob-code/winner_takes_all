import sys
import os

# Add apps/api to path
sys.path.append(os.path.join(os.getcwd(), "apps/api"))

from app.db import SQLAlchemyRepository
from app.service import WTAService

def progress_tournament():
    store = SQLAlchemyRepository()
    service = WTAService(store)
    
    # Get the "Sunday Free Cup"
    tournaments = store.list_tournaments()
    target = next((t for t in tournaments if "Free" in t.name), None)
    
    if not target:
        print("Tournament not found.")
        return

    print(f"Targeting tournament: {target.name} ({target.id})")
    
    # Get matches for this tournament
    matches = store.list_matches_by_tournament(target.id)
    # Find first pending match in round 1
    pending_r1 = [m for m in matches if m.round == 1 and m.status == "pending"]
    
    if not pending_r1:
        print("No pending matches found in Round 1.")
        # Maybe check other rounds
        pending_any = [m for m in matches if m.status == "pending"]
        if not pending_any:
            print("No pending matches anywhere.")
            return
        match = pending_any[0]
    else:
        match = pending_r1[0]

    print(f"Progressing match: {match.id} (Round {match.round})")
    print(f"  Players: {match.player1_id} vs {match.player2_id}")

    # 1. Start match
    service.start_match(match.id)
    print("  Match started.")

    # 2. Submit scores
    # Let's say Player 1 wins
    service.submit_score(match.id, match.player1_id, 45)
    service.submit_score(match.id, match.player2_id, 32)
    print("  Scores submitted (45 - 32).")

    # 3. Approve scores (triggers advancement)
    # We need an admin/approver. Let's find any user or just pass dummy record if not strictly validated
    # In WTAService.approve_scores, 'approver' is passed but not really used for permission check yet in prototype
    admin = store.get_user_by_email("pro_1@wta.gg") # One of the seeded players
    service.approve_scores(match.id, admin)
    print("  Scores approved. Winner advanced.")

    # Check updated bracket
    updated = store.get_tournament(target.id)
    if updated.bracket_state:
        # Find next round match
        next_rnd = updated.bracket_state["rounds"][match.round] # 0-indexed rounds list, so round 1 is at index 0, round 2 at index 1
        print(f"  Next Round ({next_rnd['name']}) updated.")

if __name__ == "__main__":
    progress_tournament()
