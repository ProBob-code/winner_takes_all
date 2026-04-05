# External Integrations

This workspace now includes three vendor snapshots under [vendor](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor), pinned in [manifest.json](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\manifest.json).

## Imported Repositories

### 8Ball-Pool-HTML5

- Source: <https://github.com/afzalimdad9/8Ball-Pool-HTML5>
- Pinned commit: `7c7ed602e1ab1c476f9c3562fc7388861b397b04`
- Local path: [vendor/8Ball-Pool-HTML5](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\8Ball-Pool-HTML5)
- Main entry: [index.html](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\8Ball-Pool-HTML5\index.html)

What it is:
- A static HTML5 canvas game bundle.
- The game boot sequence is driven by global script loading from `index.html` into `assets/src/*`.

Recommended WTA integration:
- Copy the static runtime into a web-served location such as `apps/web/public/8ball/`.
- Mount it inside the WTA match page at `/match/[id]`.
- Add a small bridge layer so match lifecycle and winner reporting flow back to the FastAPI backend instead of staying only in browser memory.

### Bracket

- Source: <https://github.com/evroon/bracket>
- Pinned commit: `75c2574eecd1f5722e93a7a4f0aaa6e0a454d409`
- Local path: [vendor/bracket](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\bracket)
- Backend app root: [backend](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\bracket\backend)
- Frontend app root: [frontend](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\bracket\frontend)

What it is:
- A full tournament platform of its own.
- Backend is FastAPI/Python.
- Frontend is Vite/React.

Recommended WTA integration:
- Treat Bracket as a reference implementation or sidecar service, not a drop-in package.
- Reuse bracket generation ideas and data modeling first.
- If we want the existing Bracket UI, run it as a separate internal service and sync WTA tournaments into it.
- If we want a native WTA UX, port only the bracket-generation and standings logic we need into the current FastAPI service and render brackets in the Next.js frontend.

### Hyperswitch

- Source: <https://github.com/juspay/hyperswitch>
- Pinned commit: `c5a3fce4daf059a3fdf7fe6016b497217285d626`
- Local path: [vendor/hyperswitch](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\hyperswitch)
- Workspace root: [Cargo.toml](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\hyperswitch\Cargo.toml)
- Setup script: [setup.sh](C:\Users\bajacob\OneDrive - Tecnicas Reunidas, S.A\sandbox\project_2\Winner Takes All (WTA)\vendor\hyperswitch\scripts\setup.sh)

What it is:
- A large Rust payments platform.
- Not something we should embed inside the FastAPI process.
- Best used as a separate payment orchestration service.

Recommended WTA integration:
- Keep WTA's `payments/create-order`, webhook, wallet credit, and refund logic in FastAPI.
- Let the WTA backend call Hyperswitch over HTTP for payment intent creation, status lookup, and webhook reconciliation.
- Model Hyperswitch as a sidecar or separately deployed payments service.
- Do not trust frontend payment success; FastAPI should still own idempotency, wallet ledgering, and tournament join authorization.

## Notes About Checkout

- `8Ball-Pool-HTML5` and `bracket` were copied from successful temp clones.
- `hyperswitch` was intentionally trimmed to the integration-relevant source, config, Docker, scripts, and core docs so the repo avoids Windows path-length failures from large fixture and migration trees that WTA does not need locally.
- The working copies under `vendor/` are source snapshots, not nested git repositories.

## Suggested Next Implementation Order

1. Integrate `bracket` concepts into the tournament service so WTA can generate and persist bracket state.
2. Serve `8Ball-Pool-HTML5` from the Next.js app and add match result callbacks to FastAPI.
3. Stand up `hyperswitch` as a separate payment service and wire WTA's payment routes to it.
