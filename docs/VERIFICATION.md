# Verification

Date: 2026-10-13 (UTC). Plan items E1 and E4 (`docs/PLAN.md`).

## E1 — unit tests, typecheck, build

| Command | Result |
| --- | --- |
| `npx vitest run` | 19 files, **260 tests passed** (core 118, server 93, web 49) |
| `npm run typecheck` | green (core, server, web) |
| `npm run build` | green (`web/dist`) |

New test files in this round: `web/test/liveTick.test.ts` (tick bucketing), `web/test/layoutMerge.test.ts` (three-way layout merge), `web/test/menuPosition.test.ts` (menu stays inside the viewport), `web/test/colorValue.test.ts` (color picker values); additions to `web/test/pricescale.test.ts` (percent scale), `core/test/geometry.test.ts` (visibility by interval, custom fib levels), `server/test/store.test.ts` and `server/test/server.test.ts` (409 conflict on stale `baseUpdatedAt`, monotonic `updatedAt`, `paneRatios` validation).

## E4 — browser end-to-end

Setup: a separate test server (`QT_DATA_DIR=data/test-e2e QT_FX_PROVIDER=mt5 PORT=4182 npx tsx server/src/main.ts`, serving the fresh `web/dist`, MT5 bridge on 127.0.0.1:4191) and the script's own layout (`?layout=e2e`), so the layouts in `data/store` are never touched.

Command:

```
QT_CDP=127.0.0.1:9333 node tools/e2e.mjs <targetId> http://localhost:4182
```

`QT_CDP` points the script at a private headless Chrome (`--headless=new --remote-debugging-port=9333 --user-data-dir=<temp>`). Result: **18/18 passed** (two consecutive runs), `docs/verification/e2e-results.json`:

```
PASS  loads default layout
PASS  legend shows OHLC values
PASS  symbol switch via type-to-search  — layout.symbol=MT5:EURUSD
PASS  interval change persists  — interval=15m
PASS  MT5 bars available for chart
PASS  add indicator MACD  — ema,rsi,macd
PASS  price-axis menu (auto scale off)
PASS  drawings saved for symbol  — hline,trendline
PASS  right-click opens the app menu (no browser menu)  — defaultPrevented=[true]
PASS  drawing settings window applies (OK)  — tabs: Style,Coordinates,Visibility | color=#f23645
PASS  drawing settings Cancel reverts the preview  — preview=#8bc34a -> after cancel=#f23645
PASS  reload keeps symbol/interval/indicators/drawings  — MT5:EURUSD 15m ind=3 draw=2
PASS  legend lists MACD after reload
PASS  drawings survive symbol round trip  — MT5:EURUSD draw=2
PASS  live ticks update the last bar  — close 1.11598 -> 1.11597 (stream open)
PASS  backtest runs and shows metrics  — SHARPE −16.54 … MAX DRAWDOWN −2.65%
PASS  theme toggle switches light/dark
PASS  no uncaught page errors
```

Screenshots: `docs/verification/e2e-01-load.png` … `e2e-08-dark.png` (context menu, drawing settings window, light and dark theme).

### Shared debugging Chrome (127.0.0.1:9222)

The same script against a tab in the shared Chrome passed everything while that tab was in front. When another window is in front the test tab becomes `visibilityState: hidden`: Chrome then stops painting it (no `requestAnimationFrame`, so the chart overlay stays empty) and drops synthetic mouse presses, and the checks that need clicks/legends fail (13/18 in `docs/verification/e2e-results-shared-chrome.json`). That is an environment limit, not an app failure; use a private headless Chrome via `QT_CDP` for unattended runs.

### Multi-tab check (manual script, same headless Chrome)

Two tabs on `?layout=mt`: switching the interval in tab A showed up in tab B within ~2 s (BroadcastChannel); then B set 4h while A toggled log at the same time — the stored layout kept both (`4h log=true`), no change lost.

## Root causes of the four original e2e failures

1. **Symbol switch via type-to-search** — script and app. The script typed with `Input.insertText`, which fires no key events, so the chart never opened symbol search. With real key events the app still lost text: `Dialog` re-ran its focus effect on every parent render (new `onClose` each time) and pulled focus from the search input; the chart also replaced (instead of appended) characters typed before the input had focus; and Enter could pick a stale result. All fixed in the app; the script now types real keys.
2. **Add indicator MACD** — script. It called `element.click()` on the list item, but the item only listened to `mousedown`. The script now searches and clicks the option with real mouse events; the app's options are now `role=option` and also react to click.
3. **Legend lists MACD after reload** — followed from 2; the script now reads the chart legend overlay instead of the first 40 lines of the page text.
4. **Backtest** — script. `clickTitle` toggled the panel closed when it was already open (per-browser preference), and `[class*=backtest]` matched the app root (`with-backtest`), so the first 600 characters never reached the metrics. The script now opens the panel only when closed, clicks "Run backtest" and reads `[data-testid=backtest-panel]`.

## Live data vs observed reference (2026-10-13)

Last daily bar per provider, compared with the provider's own quote and with values read off a reference charting UI (`docs/observed-reference.json`):

| Symbol | Our last bar (O / H / L / C) | Quote last | Reference | Result |
|---|---|---|---|---|
| AAPL (Yahoo) | 338.16 / 342.63 / 337.60 / 340.97 | 340.97 | 338.22 / 342.63 / 337.60 / 340.97 | H/L/C exact; open differs by 0.06 (consolidated vs. exchange official open) |
| ^NDX (Yahoo) | 30796.04 / 30813.96 / 30618.64 / 30664.70 | 30664.70 | last 30,664.70 | exact |
| BINANCE:BTCUSDT | live session | within the live spread | — | consistent |
| MT5:EURUSD | 1.11531 / 1.11612 / 1.11511 / 1.11586 | 1.11586 | — | exact |

Bug found and fixed by this check: Yahoo returns the current session's daily row with `close: null` until it finalizes the bar; the validator dropped the row, so the chart ended one session early. The live row is now completed from the chart meta (`regularMarketPrice`, day high/low) when the quote time falls inside that bar (`server/test/yahoo-live-row.test.ts`).

## Indicators vs published values
RSI(14) on the classic Wilder worked example: all 19 published values reproduced exactly to 2 decimals (`core/test/published-examples.test.ts`). Every indicator also matches an independent naive implementation to 1e-9 on 500 seeded bars.

## Phase G — roadmap features (2026-10-13)

- `npx vitest run`: 55 files, **599 tests passed**; `npm run typecheck` and `npm run build` green.
- `tools/e2e.mjs` (includes `tools/e2e-panels.mjs`) on an isolated server (port 4188, own data dir) in a private headless Chrome: **56/56 passed** — log in `docs/verification/e2e-g6-full.log`.
  Covers: core chart flow, context menus, drawing settings (OK applies, Cancel reverts a real preview change), live MT5 ticks, backtest, themes; workspace (tabs, grid 4, red link group, crosshair sync, restore, maximize, close/reopen, shortcuts help, deep links, request dedupe); panels (watchlist flags/filter, alert create → SSE toast → log → badge, screener, portfolio holdings + donut, paper order, scripts in the sandboxed worker incl. 2 s kill); chart features (Renko, volume profile, candle patterns, auto-fib → drawing, compare, formula AAPL/MSFT, custom 2h with paging, bar replay with paper P&L, CSV and PNG export).
- Lesson recorded: the e2e must run in a fresh browser profile — leftover tabs from an aborted run share the test workspace via BroadcastChannel and keep autosaving, which stalls a new run.

## Phase H — drawing-tool parity, final integration (2026-10-13)

Conformance (`npm run test:drawings`, `docs/verification/drawings-coverage.md`, per family `drawings-coverage-<family>.md`): **379 / 379 tests, 0 gaps**.

| Measure | Result |
|---|---|
| Catalog tools registered | **92 / 92** (7 allow-listed out of scope: Image, Tweet, Idea, Order, Position, legacy Elliott, VbPFixed — reasons in `web/test/drawings/allowlist.json`) |
| Catalog fields with tab, type, choices and factory default | **1990 / 1990** |
| Settings that change the rendering (wiring, incl. coordinates and visibility) | **1120 / 1120** |
| Settings fields reachable in the settings window (control rendered, value stored) | **958 / 958** |
| Tools passing the interaction smoke test | **93 / 93** |
| Left toolbar | every reference item mapped, reference order, no tool outside the reference (87 tools in 7 flyouts) |

Unit tests: `npx vitest run` — **100 files, 1430 tests passed**; `npm run typecheck` and `npm run build` green. New in this round: `core/test/drawings-alerts.test.ts` (shared alert geometry per type), `web/test/drawings-alerts.test.ts` (tools ↔ catalog ↔ dialog ↔ server agree; the evaluated value lies on the drawn body), `web/test/drawings-hooks.test.ts` (inline editing, table cells, anchored tools after drag + zoom, choosers, hidden tools, sector buttons), additions to `server/test/alerts-evaluate.test.ts` (every alert-capable type fires / does not fire), `server/test/h1-stream.test.ts` (one consolidated errors frame) and `web/test/drawings-projection.test.ts` (position ticks ↔ price ↔ entry, bars pattern captured once).

End-to-end: `tools/e2e.mjs` on an isolated server (port 4198, `QT_DATA_DIR=data/test-h5`, `QT_FX_PROVIDER=mt5`, MT5 bridge on 4191) in a fresh headless Chrome profile: **78/78 passed** (log `docs/verification/e2e-h5-full.log`). New checks: stream survives an unknown symbol (one errors frame + ticks), flyouts list exactly the reference tools (87/87, hidden tools excluded), inline text editing (creation, multi-line commit, double-click, Enter), table cell edited in place, long position ticks ↔ price ↔ Entry price, tool chooser on pick (flyout and favorites bar), and an alert on an info line created through "Add alert on info line…" that fires on the server.

Screenshot sheets (`node tools/drawing-sheets.mjs <target> http://localhost:4198`): `docs/verification/drawings-<family>.png` for lines, channels, pitchforks, gann, fibonacci, patterns, elliott, cycles, projection, brushes, arrows, shapes, text, icons, measure — every tool of the family drawn, dark above, light below — and `docs/verification/drawings-flyouts.png` (all seven flyouts with every tool, dark and light). The e2e also writes `e2e-draw-flyout-<group>-{dark,light}.png`.

Found and fixed on the way: the inline text editor closed right after opening when it was opened by a press on the chart (the press moved focus to the chart, and the blur committed); it now opens after the press and returns focus to itself when the chart takes it. The e2e clears drawing preferences left by an earlier run in the same browser (toolbar faces), which otherwise hid the "Trend line" face.
