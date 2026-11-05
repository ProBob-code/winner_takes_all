# W.T.A Eight Ball

`index.html` is the **WTA Eight Ball** design: the look, physics, AI, trash talk, cat reactions, combos and felts. It runs on `support.js`, the design runtime, which loads React and Babel from unpkg. The pictures it bundles are in `assets/`.

It only runs inside `/play/8ball`. Opened directly, it sends the browser there.

## What was added to the design

- **Sign-in first:** until the page says who is playing, the game shows a loading screen. If nobody is signed in, it shows a sign-in screen instead (the page also redirects to `/login?next=/play/8ball`).
- **Real names:** the signed-in player's name is on the HUD, the menu ("Playing as …") and the result card.
- **vs Player:** asks for both names first. Player 1 is filled with the signed-in name, and Player 2 is remembered on the device.
- **Loading screen:** every game opens on a versus screen showing the players, the mode and what a win is worth.
- **Landscape only on phones:** on a touch screen held upright, the whole game is turned 90° so it always plays in landscape. `rot()`, `cp(e)` and `lr(el)` map pointer positions and element rectangles into the turned frame, and every pointer handler goes through them. Picking a game on a phone also asks for full screen and a landscape lock. Where the browser allows that (Android Chrome), the rotation is real; elsewhere the CSS turn is the fallback. Add `?rot=1` to force touch mode for testing.
- **Aiming:** a click or tap never moves the aim, and hovering does not either. Dragging on the table turns the aim from where it already points, following the drag's angle around the cue ball at 0.6×. With a mouse, a drag straight back along the cue is a power stroke instead.
- **Cue-stick power:** on the left of the table. Pull it back (down in landscape, left in a tall desktop window) and the power fills in behind it; releasing shoots.
- **Fine aim and spin:** on the right of the table. The AIM dial turns the aim by about 0.05° per pixel dragged and shows the angle, and the mouse wheel over it works too. The SPIN ball sits above the dial.
- **Short screens (phones in landscape):** the table uses almost the full height. The combo stats move to a small badge above the power cue.
- **Ball rows:** every ball of each group is shown; potted balls are dimmed and greyed.
- **Combo bar:** on taller screens without the side panel, a bar shows the shooter's streak, combos, best combo and the combo coins at stake.
- **Coins are real:**
  - The HUD chip and the menu show the player's actual WTA Coins balance.
  - The result card shows what the server paid, including the combo share.
  - What each mode pays:

    | Mode | A win pays | Each combo in a win |
    | --- | --- | --- |
    | vs System | 3K, 4K or 5K by level | +1K, up to 4 a game |
    | vs Online | 5K | +1K, up to 4 a game |
    | vs Player | nothing; one person can play both sides | nothing |

  - Combo coins (`ONLINE_COMBO`) are paid only with a win, and they count against the same online daily cap. `game_over` carries `combos`. The server caps the count at the number of shots taken and at four.
  - Combo points (pts) are still shown for everyone, as score.
- **vs Online:** real players, using the `PoolRooms` Durable Object in `apps/api`.
  - The game opens `/api/pool/lobby`, shows a versus screen when matched, then opens `/api/pool/table/<uuid>`.
  - The shooter sends `aim`, `shot` and then `settled`. The other screen replays the shot, then confirms it with `settled`.
  - **The replay is exact, not approximate.** Three things make it so:
    - Physics runs in fixed ticks of 1/240 s (`TICK`), whatever the frame rate.
    - A step uses only correctly rounded maths (`+ - * /` and `Math.sqrt`, never `Math.hypot`).
    - `shot` carries every ball's exact position and the cue's exact velocity (`v`).

    Both screens therefore compute the same shot bit for bit. In a two-player test with one screen's CPU slowed 4×, the replay matched the shooter on all 8 shots to 0.000000 units. Before this, balls jumped by up to 705 units when `settled` landed.
  - Snapshots go at full precision. `aim` is sent only when it changes (at most 20 a second), and the other screen glides into it rather than jumping.
  - The table Durable Object relays `shot` and `settled` before it writes them to storage, so the save never delays the replay.
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
