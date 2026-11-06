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
    | vs Player | 3K when player 1 (the signed-in account) wins | +1K, up to 4 a game |

  - **Every won game pays.** Once the 25K online daily ceiling is reached, a win still pays 1K (`ONLINE_WIN_FLOOR`, no combos), bounded only by the overall daily cap.
  - An online win counts however short it is, because the server refereed it (a resignation, a foul on the 8). Elsewhere a game must last 10 s and 2 shots (`MIN_ONLINE_SECONDS`, `MIN_ONLINE_SHOTS`).
  - Combo coins (`ONLINE_COMBO`) are paid only with a win, and they count against the same online daily cap. `game_over` carries `combos`. The server caps the count at the number of shots taken and at four.
  - Combo points (pts) are still shown for everyone, as score.
- **Pause menu:** the menu button in a game opens a pause card (Escape does too): Resume, the aim guide, Main menu, Leave, and Resign (online) or End game. Starting another mode mid-game asks first, because it resigns or ends the current one.
- **Coming back to a game:** a game in progress is saved on the device (`wta8.local` for vs System and pass and play, `wta8.table` for online) after every shot and when the page is left. The menu then offers **Continue your game** or **Rejoin your online game**. Online, the table holds a dropped seat for 90 s (`GRACE_MS` in `pool-rooms.ts`); rejoining takes the table from the `hello` snapshot. A finished, resigned or forfeited game clears the save.
- **Shot clock:** 45 s a shot (`SHOT_CLOCK`), shown on the shooter's card and, under 10 s, in the hint, with a tick for the last five. Running out is a foul: ball in hand to the other player. Local games stop the clock while a menu is open; online it keeps running. Online, the shooter's screen calls time and sends the table as `settled`; if that screen has gone quiet (a locked phone), the other screen calls it 10 s later.
- **Taunts:** the sticker button in the top bar opens the Taunt Zone (online and vs System): twelve pool emotes (Call it, Rack 'em, Ice cold, Snookered, Crown me…) and eight picture stickers with pool captions. Online they go to the other player as `taunt`; the Machine answers with one of its own. One every 2.5 s.
- **Aim guide is the table's:** online and in pass and play the guide stays as the game started. Online the table takes both players' setting (`pref`) and is on only if both had it on. Turning it on mid-game asks the other player (`assist_ask`); they allow it (`assist_ok`, on for both) or say no (`assist_no`). Turning it off is always yours. vs System and practice are unchanged.
- **Called pocket:** online, `aim` carries the called pocket (`c`), so the waiting player sees it marked CALLED, and the hint says the shooter is on the 8.
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
  - **Recovery from lost messages.** Both cases rejoin the table (`netResync`) and take the table from the `hello` snapshot. Neither happens in normal play (0 resyncs over an 8-shot two-player test).
    - The end-of-shot `settled` never arrives (`awaitSnap` for over 4 s).
    - The opponent's screen goes silent during their turn for 8 s. While aiming it sends `aim` at least once a second.
  - Rejoining drops the old socket rather than waiting for it to close, because a half-closed socket can stay in `CLOSING` indefinitely.
  - On the opponent's turn the hint names them ("Ben has ball in hand · waiting for their shot") instead of showing your own controls.
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
