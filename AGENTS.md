# Quant Terminal — agent notes

Self-hosted charting + quant research terminal. Spec: `docs/SPEC.md`. Plan/status: `docs/PLAN.md`.

## Rules
- **Clean room.** Implement from `docs/SPEC.md` and public formula definitions only. Never read, copy or paraphrase code from any decompiled/third-party charting product.
- No assistant/vendor-AI names anywhere (code, UI, docs, metadata, commits).
- Full color theme (user choice 2026-10-13): blue accent in the UI, green/red for up/down, multi-color indicators, dark + light themes. All colors come from theme tokens; no "connected" status pills.
- Web code is split: CSS files, JSON data, and TS/TSX components joined by imports — never one big file.
- Every relevant change gets a line in `CHANGELOG.md` under *Unreleased*.
- `core/` is pure TypeScript with no runtime dependencies and no DOM; it is shared by server and web.

## Layout
- `core/src/types.ts` — shared contracts (Bar, Interval, Layout, Drawing, StrategyDef, BacktestConfig, …).
- `core/src/indicators/`, `core/src/backtest/`, `core/src/drawings/` — pure logic, tests in `core/test/`.
- `server/` — Node HTTP API on port 4180: market data (Yahoo, Binance), disk cache `data/cache`, JSON store `data/store`.
- `web/` — React + Vite app on port 5180 (proxies `/api` to 4180); own canvas chart engine in `web/src/chart/`.

## Commands
- `npm install` · `npm test` · `npm run typecheck` · `npm run build`
- `npm run dev` — server + web together.
- The user views the app on **http://localhost:4180** (server serving the built `web/dist`), not the Vite dev server: keep `npx vite build --watch` (in `web/`) running, or rebuild after every change, otherwise changes are invisible there.
- `node tools/e2e.mjs <cdpTargetId> <baseUrl>` — browser end-to-end on its own layout (`?layout=e2e`); set `QT_CDP=host:port` to use a private (headless) Chrome — a hidden tab in a shared Chrome stops painting and drops clicks. Run it against a separate server (`QT_DATA_DIR=… PORT=4182`), never against the live data store.
- `node tools/drawing-sheets.mjs <cdpTargetId> <testServerUrl> [family,…]` (with `QT_CDP`) — screenshot sheets `docs/verification/drawings-<family>.png` (every tool drawn, dark + light) and `drawings-flyouts.png`; test servers only.

## MetaTrader 5 bridge (live FX)
- `bridge/mt5_bridge.py` — Python sidecar on 127.0.0.1:4191 using the `MetaTrader5` package against the locally running terminal. **Read-only by construction**: the module is wrapped in an allow-list of market-data functions; order/position functions raise. The connected account is a real-money account — never add trading calls.
- Port 4190 is on the Fetch blocked-ports list (Node/browsers refuse it); keep 4191.
- MT5 reports broker server time (currently UTC+3); the bridge measures the offset from live ticks and returns UTC. Intraday bars are converted to UTC; 1D/1W/1M bars are stamped at UTC midnight of the trading date (same as the other providers).
- Freshly selected symbols return stale ticks/daily history for a moment; quotes wait until `session_close` and the previous daily bar agree.
- Symbols: `MT5:<broker name>` (case-sensitive broker names such as `AAPL.NAS` are recovered from the symbol list). `QT_FX_PROVIDER=mt5` also routes `EURUSD=X`, `FX:EURUSD`, `OANDA:EURUSD` to MT5.
- Live ticks: `GET /api/stream?symbols=MT5:EURUSD,...` (Server-Sent Events, `event: tick`).
- Setup: `bridge\setup.cmd`; run everything with `Start Terminal (MT5).cmd`.
