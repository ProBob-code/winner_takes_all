# W.T.A Eight Ball

`index.html` is the **WTA Eight Ball** design, used as-is: the look, physics, AI, trash talk, cat reactions, combos and felts. It runs on `support.js`, the design runtime, which loads React and Babel from unpkg. The pictures it bundles are in `assets/`.

## What was added to the design

- **Host messages:** it reports `game_start` and `game_over` to the page (`{ wtaCoins: true, ... }`) for coins and trophies. Mode 1 is vs System, 2 is vs Player and 3 is online.
- **Back to games:** posts `exit`.
- **vs Online:** real players, using the `PoolRooms` Durable Object in `apps/api`.
  - The game opens `/api/pool/lobby`, then `/api/pool/table/<uuid>`.
  - The shooter sends `aim`, `shot` and then `settled` with the resulting table.
  - The other screen replays the shot, then snaps to `settled`.
  - Both screens send `result`. The server decides, and the coin claim reads that verdict.
- **Config from the page:** the page sends `{ wtaHost: true, type: "config", apiBase, signedIn, name }`.
