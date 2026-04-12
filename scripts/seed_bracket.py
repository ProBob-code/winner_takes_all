import sys
import os

# Add apps/api to path
sys.path.append(os.path.join(os.getcwd(), "apps/api"))

from app.db import SQLAlchemyRepository, create_id
from app.security import hash_password
from app.service import WTAService

def seed_bracket():
    store = SQLAlchemyRepository()
    service = WTAService(store)
    
    # Get the "Sunday Free Cup"
    tournaments = store.list_tournaments()
    target = next((t for t in tournaments if "Free" in t.name), None)
    
    if not target:
        print("Sunday Free Cup not found.")
        return

    print(f"Targeting tournament: {target.name} ({target.id})")
    print(f"Current players: {len(target.participants)} / {target.max_players}")
    
    needed = target.max_players - len(target.participants)
    if needed <= 0:
        print("Tournament is already full.")
        return
    
    print(f"Seeding {needed} players...")
    
    for i in range(needed):
        name = f"Pro Player {i+1}"
        email = f"pro_{i+1}@wta.gg"
        
        # Check if user exists
        user = store.get_user_by_email(email)
        if not user:
            user = store.create_user_with_bonus(
                name=name,
                email=email,
                password_hash="hashed_pw",  # Placeholder
                bonus_cents=100000
            )
        
        try:
            service.join_tournament(user, target.id)
            print(f"  Joined: {name}")
        except Exception as e:
            print(f"  Failed to join {name}: {e}")

    # Refresh tournament
    updated = store.get_tournament(target.id)
    print(f"Final status: {updated.status}")
    if updated.bracket_state:
        print("Bracket generated successfully!")
        rounds = updated.bracket_state.get("rounds", [])
        for r in rounds:
            print(f"  Round: {r['name']} - {len(r['matches'])} matches")
    else:
        print("Bracket was NOT generated.")

if __name__ == "__main__":
    seed_bracket()
