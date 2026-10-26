# Implementation plan

Status markers: `[ ]` todo · `[~]` in progress · `[x]` done.

## Phase A — Foundations
- [x] A1 Repo scaffold: npm workspaces `core`, `server`, `web`; TypeScript strict; Vitest; Vite; scripts `dev`, `test`, `build`.
- [x] A2 `core/types.ts` shared contracts (Bar, Interval, SymbolInfo, Quote, Drawing, Layout, Watchlist, Strategy, BacktestConfig, BacktestResult).

## Phase B — Core (parallel)
- [x] B1 Indicators + reference tests (independent naive implementations + worked examples).
- [x] B2 Backtest engine + metrics + 5 strategies + toy-scenario and no-look-ahead tests.
- [x] B3 Drawing geometry: data↔pixel transforms, hit-testing, fib levels; tests.

## Phase C — Server (parallel with B)
- [x] C1 Providers: Yahoo chart/search/quote, Binance klines/ticker; symbol routing; interval mapping.
- [x] C2 Disk cache + history paging; JSON store for watchlists/layouts; REST routes; tests with recorded fixtures.

## Phase D — Web (parallel with B/C, against the contracts)
- [x] D1 Chart engine: scales, panes, series renderers, crosshair, zoom/pan, live upsert, history paging.
- [x] D2 Indicators UI (add/remove/edit inputs), separate panes.
- [x] D3 Drawing tools UI (create/select/drag/delete, magnet), persisted via layout.
- [x] D4 Watchlist panel + symbol search; layout autosave.
- [x] D5 Backtest panel: config form, metrics, equity/drawdown mini-charts, trades table, trade markers on chart.

## Phase E — Verification loop
- [x] E1 `npm test` all green; `npm run build` green. (260 tests, typecheck and build green — see docs/VERIFICATION.md)
- [x] E2 Live-data check: AAPL / ^NDX / BTCUSDT / MT5:EURUSD last bar vs quote and vs observed reference — fixed Yahoo null-close on the live row; see docs/VERIFICATION.md.
- [x] E3 Indicator cross-check: reference chart did not expose indicator values signed out, so RSI(14) is verified against the published Wilder worked example (19/19 values exact) plus naive reference implementations (1e-9).
- [x] E4 Browser end-to-end: load, switch symbol, switch interval, add indicator, draw, reload → persisted; run backtest. (`tools/e2e.mjs`, 18/18 — plus live ticks, context menus, drawing settings, themes)
- [x] E5 Fix → re-run until all pass. Record results in `docs/VERIFICATION.md`.

## Phase F — Desktop app
Dropped (2026-10-13): everything is integrated into the web version. Useful desktop behaviors move into phase G
(in-app tabs, multi-chart, link groups, crosshair sync, browser notifications, shortcuts, URL deep links).
`docs/DESKTOP.md` stays as reference for those behaviors.

## Phase G — Roadmap features in the web app (docs/ROADMAP.md)
Wave 1 (parallel):
- [x] G1 Core analysis: chart transforms (Renko, Kagi, Line Break, Point & Figure, range bars, custom intervals), spread/ratio expressions, candlestick patterns, pivots/zig-zag, auto Fib, auto chart patterns, volume profile + TPO, multi-timeframe alignment, walk-forward optimization, CSV export.
- [x] G2 Server: alerts engine (price / indicator / drawing / multi-condition, webhooks, notification feed), screener over a universe, dividends/splits events + adjusted/extended-hours bars, portfolios, paper trading account.
- [x] G3 Web workspace: in-app chart tabs, multi-chart grids (1–16) with color link groups (symbol / interval / time) and crosshair sync, keyboard shortcuts, URL deep links, session restore.
Wave 2 (after wave 1):
- [x] G4 Web chart features: new chart types, compare symbols, volume profile / TPO / pattern overlays, auto Fib and chart-pattern drawings, Bar Replay with paper trading, CSV/PNG export.
- [x] G5 Web panels: alerts (create from chart/drawing, list, log, browser notifications, sound), screener, portfolios, paper account, user scripting (sandboxed Web Worker indicators/strategies), watchlist import/export/columns/flags. (built; mounted in App during G6 integration)
- [x] G6 Verification: unit tests per feature, e2e extended per feature, docs/VERIFICATION.md updated.

## Phase H — Polish + drawing-tool parity (docs/DRAWING-TOOLS.md)
- [x] H1 Polish: price-axis label collision handling, compare history paging, session-aligned custom intervals, per-symbol live-stream isolation, cross-tab links, small UX fixes found on the way.
- [x] H2 Drawing architecture: tool registry, creation modes (click/drag/freehand/poly), multi-select, copy/paste, undo/redo, magnet weak/strong, templates, visibility, lock/hide all, stay-in-drawing mode, sync to same-symbol charts; full context menu, floating toolbar, grouped left toolbar with favorites, object tree panel; migrate existing 13 tools.
- [x] H3 Tool families (parallel, on the registry): lines, channels, pitchforks, gann, fibonacci, patterns + elliott, cycles, projection/measurement + positions, brushes/arrows/shapes, text/notes/icons.
- [x] H4 Verification: unit tests per tool, e2e per family, screenshot sheets (conformance 100 %, 0 gaps; e2e 78/78; `docs/verification/drawings-<family>.png`, `drawings-flyouts.png`; see docs/VERIFICATION.md, Phase H).
- [x] H5 Integration after families: server alert support (`server/src/alerts/evaluate.ts#drawingValue`) + `CHANNEL_TYPES` in `web/src/panels/alerts/alertModel.ts` for new alert-capable tools (infoline, trendangle → line; flatBottom, disjointChannel → band; plus requests from families B/D/E); `tools/index.ts` imports for any new family folders; final conformance run + flyout screenshots.
