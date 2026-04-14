import random
import time
from typing import List

class Player:
    def __init__(self, name, is_user=False):
        self.name = name
        self.is_user = is_user
        self.status = "active"

class Match:
    def __init__(self, p1, p2, round_name):
        self.p1 = p1
        self.p2 = p2
        self.round_name = round_name
        self.winner = None

    def play(self):
        print(f"\n--- {self.round_name}: {self.p1.name} vs {self.p2.name} ---")
        
        if self.p1.is_user or self.p2.is_user:
            user = self.p1 if self.p1.is_user else self.p2
            bot = self.p2 if user == self.p1 else self.p1

            while True:
                result = input(f"👉 Your Match! Enter result for {user.name} (w = Win, l = Lose): ").lower()
                if result in ['w', 'l']:
                    break
                print("Invalid input. Please enter 'w' or 'l'.")

            if result == 'w':
                self.winner = user
                print(f"🎉 You won! {user.name} advances to the next round.")
            else:
                self.winner = bot
                print(f"😔 You lost. {bot.name} advances. Simulation continues...")
        else:
            # Bot vs Bot - simulated delay for effect
            time.sleep(0.5)
            self.winner = random.choice([self.p1, self.p2])
            print(f"✅ {self.winner.name} wins and advances.")
        
        return self.winner

def print_bracket(players: List[Player], round_name):
    print(f"\n{'='*10} BRACKET: {round_name} {'='*10}")
    for i in range(0, len(players), 2):
        p1_name = players[i].name if i < len(players) else "BYE"
        p2_name = players[i+1].name if i+1 < len(players) else "BYE"
        print(f"  [{p1_name}] vs [{p2_name}]")
    print('='*35)

def simulate_tournament():
    print("🏆 WELCOME TO THE TOURNAMENT SIMULATOR 🏆")
    print("-----------------------------------------")
    
    user_name = input("Enter your name: ").strip() or "YOU"
    players = [Player(user_name, True)] + [Player(f"AI_BOT_{i}") for i in range(1, 8)]
    random.shuffle(players)

    print("\n🎯 Initial Seeding:")
    for i, p in enumerate(players):
        print(f"Seed {i+1}: {p.name}")

    # Quarterfinals
    print_bracket(players, "Quarterfinals")
    qf_winners = []
    for i in range(0, 8, 2):
        match = Match(players[i], players[i+1], "Quarterfinal")
        qf_winners.append(match.play())

    # Semifinals
    print_bracket(qf_winners, "Semifinals")
    sf_winners = []
    for i in range(0, 4, 2):
        match = Match(qf_winners[i], qf_winners[i+1], "Semifinal")
        sf_winners.append(match.play())

    # Final
    print_bracket(sf_winners, "Finals")
    match = Match(sf_winners[0], sf_winners[1], "Grand Final")
    final_winner = match.play()

    print("\n" + "#"*40)
    print(f"🏆 TOURNAMENT WINNER: {final_winner.name} 🏆")
    print("#"*40)
    
    if final_winner.is_user:
        print("\nCONGRATULATIONS! You took home the trophy! 🥂")
    else:
        print("\nBetter luck next time! The AI takes the win. 🤖")

if __name__ == "__main__":
    try:
        simulate_tournament()
    except KeyboardInterrupt:
        print("\n\nSimulation terminated.")
