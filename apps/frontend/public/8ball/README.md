# W.T.A Eight Ball

`index.html` is the **WTA Eight Ball** design: the look, physics, AI, trash talk, cat reactions, combos and felts. It runs on `support.js`, the design runtime, which loads React and Babel from unpkg. The pictures it bundles are in `assets/`.

It only runs inside `/play/8ball`. Opened directly, it sends the browser there.

## What was added to the design

- **Sign-in first:** until the page says who is playing, the game shows a loading screen. If nobody is signed in, it shows a sign-in screen instead (the page also redirects to `/login?next=/play/8ball`).
- **Real names:** the signed-in player's name is on the HUD, the menu ("Playing as …") and the result card.
- **vs Player:** asks for both names first. Player 1 is filled with the signed-in name, and Player 2 is remembered on the device.
- **Loading screen:** every game opens on a versus screen showing the players, the mode and what a win is worth.
- **Mouse power:** press anywhere on the table (away from the cue ball during ball in hand) and pull back. The power bar lights up with a percentage, and releasing shoots.
- **Coins are real:**
  - The HUD chip and the menu show the player's actual WTA Coins balance.
  - The result card shows what the server paid.
  - Combo rewards are points, not coins.
  - What each mode pays:

    | Mode | A win pays |
    | --- | --- |
    | vs System | 3K, 4K or 5K by level |
    | vs Online | 5K |
    | vs Player | nothing; one person can play both sides |
- **vs Online:** real players, using the `PoolRooms` Durable Object in `apps/api`.
  - The game opens `/api/pool/lobby`, shows a versus screen when matched, then opens `/api/pool/table/<uuid>`.
  - The shooter sends `aim`, `shot` and then `settled`. The other screen replays the shot, then snaps to `settled`.
  - Both screens send `result`. The server decides, and the coin claim reads that verdict.
  - The menu shows how many players are online. These are real heartbeats from `POST /api/pool/presence`, counted by the lobby.
- **Host messages:**
  - Game to page (`{ wtaCoins: true, ... }`): `ready`, `game_start`, `game_over` and `exit`.
  - Page to game (`{ wtaHost: true, ... }`):

    | Message | Carries |
    | --- | --- |
    | `config` | `apiBase`, `signedIn`, `name` and `balance` |
    | `presence` | the online counts |
    | `result` | `awarded`, `balance`, `message` and `trophies` |
    | `balance` | the new balance |
