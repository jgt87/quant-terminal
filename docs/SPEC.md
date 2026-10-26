# Quant Terminal — Technical Specification

A self-hosted charting and quant research terminal: real market data, candlestick charts,
technical indicators, drawing tools, persistent watchlists and layouts, and a backtesting
engine with fees, slippage and drawdown analysis.

## 0. Provenance (clean room)

This spec was written from **observed behavior** of a commercial web charting product
(recorded interactions, network message shapes, feature inventory) and from public
formula definitions. No third-party source code is copied into this project. Every
implementation here is original. The behavioral evidence lives outside this repo.

Key observations that shaped the design:

| Observation | Design consequence |
|---|---|
| Chart data streams over one WebSocket with session ids; a symbol switch = resolve + modify series; a timeframe switch = one modify-series message answered by a full bar snapshot | Data layer keyed by `(symbol, interval)`; switching either replaces the whole series atomically |
| Scrolling into the past sends paged "more data" requests (9–72 bars each) | History is loaded in pages when the viewport nears the left edge |
| Live bars arrive as updates that rewrite the last bar (same index) or append | `upsertBar()` semantics: replace if same time, else append |
| Standard indicators (RSI, EMA, …) produce **no** network traffic — computed client-side | All indicators are pure functions in `core/`, run in the browser |
| Drawings produce no network traffic until the layout is saved | Drawings live in layout state; persisted with the layout |
| Invalid symbol → symbol error → series error → empty-state "symbol doesn't exist" | Explicit error state in the chart, not a blank canvas |
| ~120 built-in studies, ~110 drawing tools, separate chunks for alerts, watchlists, replay, backtesting | Plugin-style registries for indicators and drawing tools |

## 1. Architecture

```
web/  (React + TypeScript, Vite)          server/  (Node + TypeScript)
  ChartEngine (own canvas renderer)  ⇄  REST /api/*  ⇄  providers: Yahoo (stocks, indices, FX), Binance (crypto)
  Panels: watchlist, indicators,           disk cache  data/cache/*.json
          drawings, backtest               store       data/store/*.json  (watchlists, layouts)
core/ (pure TypeScript, shared, no DOM) — types, indicators, backtester, drawing geometry
```

- `core/` has zero runtime dependencies and is 100% unit-tested.
- The server holds all network access (no CORS issues, one cache, one place for rate limits).

## 2. Data model (`core/types.ts`)

- `Bar { time: number /* UTC seconds, bar open */; open; high; low; close; volume }`
- `Interval = "1m"|"5m"|"15m"|"30m"|"1h"|"4h"|"1D"|"1W"|"1M"`
- `SymbolInfo { symbol; name; exchange; type: "stock"|"index"|"crypto"|"fx"|"etf"|"future"; currency; provider: "yahoo"|"binance" }`
- `Quote { symbol; last; change; changePct; time }`
- Series invariants: strictly increasing `time`, no duplicates, `low ≤ min(open,close)`, `high ≥ max(open,close)`.

## 3. Server API

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/search?q=` | Symbol search across providers (max 20) |
| GET | `/api/bars?symbol=&interval=&to=&limit=` | Bars ending before `to` (paging into history); cached |
| GET | `/api/quotes?symbols=a,b` | Last price + change for watchlist rows |
| GET/PUT | `/api/watchlists` | Persistent watchlists (`{ id, name, symbols[] }[]`) |
| GET/PUT/DELETE | `/api/layouts/:id` | Chart layout: symbol, interval, chart type, indicators, drawings |
| POST | `/api/backtest` | Run a strategy server-side on cached bars (same core engine) |
| GET | `/api/stream?symbols=` | Server-Sent Events with live ticks for streamable (MT5) symbols |

Errors: `{ error: { code, message } }` with 400 (bad input), 404 (unknown symbol), 502 (provider failure).
Symbol routing: `MT5:` prefix → local MetaTrader 5 bridge (read-only, live ticks); contains `USDT`/`BUSD` or `BINANCE:` prefix → Binance; otherwise Yahoo (`NASDAQ:NDX` → `^NDX`). With `QT_FX_PROVIDER=mt5`, FX pairs go to MT5.
Intraday limits follow provider limits (Yahoo 1m ≈ 7 days, 1h ≈ 730 days); the API reports the reached start (`hasMore=false`).

## 4. Chart engine (`web/src/chart/`)

- Canvas 2D, device-pixel-ratio aware, separate layers: background/grid, series, overlays (indicators, drawings), crosshair/UI.
- **Time scale**: index-based (bar spacing in px, right offset), so gaps (weekends) are skipped. Zoom with wheel/pinch keeps the bar under the cursor fixed; drag pans; double-click on the axis resets.
- **Price scale**: auto-fit to visible bars (+ margins), manual drag-scale, linear and log modes; "nice" tick steps (1/2/2.5/5 × 10ⁿ).
- **Series types**: candles, hollow candles, OHLC bars, line, area, Heikin-Ashi.
- **Panes**: main pane + stacked indicator panes with draggable separators; each pane has its own price scale.
- **Crosshair** with OHLCV legend for the hovered bar, and per-indicator values.
- **Live updates**: polling quote/last bar; `upsertBar` semantics.
- **History paging**: when the leftmost visible index < 50, request older bars.
- Performance target: 10,000 bars, 5 indicators, 60 fps pan/zoom on a laptop.

## 5. Indicators (`core/indicators/`)

Each indicator: `{ id, name, pane: "overlay"|"separate", inputs: schema, outputs: names[], compute(bars, inputs) => Record<output, (number|null)[]> }`.
Output arrays are aligned to bars; warm-up values are `null`.

| Indicator | Definition |
|---|---|
| SMA(n) | arithmetic mean of last n closes |
| EMA(n) | α = 2/(n+1), seeded with SMA(n) at index n−1 |
| WMA(n) | weights 1..n |
| RSI(n) | Wilder smoothing (RMA) of gains/losses, seeded with simple average of first n changes; 100 when avg loss = 0 |
| MACD(12,26,9) | EMA12 − EMA26; signal = EMA9 of MACD; histogram = MACD − signal |
| Bollinger(20,2) | SMA20 ± 2 × population stdev |
| ATR(14) | RMA of true range |
| Stochastic(14,3,3) | %K = SMA3 of raw %K; %D = SMA3 of %K |
| VWAP (session) | Σ(typical × vol)/Σvol, reset each UTC day (intraday) |
| OBV | cumulative ± volume |
| Donchian(20) | highest high / lowest low |
| Volume | bars, shaded by direction |

## 6. Drawing tools (`core/drawings/` geometry, `web/src/chart/drawings/` rendering)

Anchors are stored in **data space** (`{ time, price }`), never pixels, so drawings survive zoom, resize, timeframe changes and reloads.
Tools: trend line, ray, extended line, horizontal line, horizontal ray, vertical line, rectangle, parallel channel, Fibonacci retracement (0, .236, .382, .5, .618, .786, 1), price range / measure, text note.
Interaction: select tool → click anchors → finish; hit-testing with 6 px tolerance; drag anchors or whole shape; Delete removes; Esc cancels; magnet mode snaps to OHLC of nearest bar.

## 7. Watchlists & layouts

- Multiple named watchlists; add/remove/reorder symbols; live last/change/change% rows; click → load symbol.
- Layout = `{ id, name, symbol, interval, chartType, indicators: {id, inputs}[], drawings: Drawing[] }`; autosaved (debounced 1 s) to the server; restored on load.

## 8. Backtesting engine (`core/backtest/`)

- Bar-by-bar event loop; a strategy sees only bars `≤ i` (no look-ahead). Orders placed on bar i fill at bar **i+1 open** (market) or when price crosses (stop/limit) within bar i+1.
- Costs: commission (bps of notional and/or fixed per trade), slippage (bps against the trader), optional spread.
- Sizing: fixed quantity, % of equity, or fixed cash; long, short or both; one position at a time (net).
- Risk: optional stop-loss / take-profit in %; if both are hit in one bar, the stop is assumed first (conservative).
- Outputs: trades (entry/exit time & price, qty, P&L, fees, bars held), equity curve, drawdown curve, buy-and-hold benchmark.
- Metrics: total return, CAGR, annualized volatility, Sharpe, Sortino, max drawdown (% and duration), Calmar, win rate, profit factor, average win/loss, expectancy, exposure %, trade count, total fees.
- Built-in strategies: SMA crossover, RSI mean reversion, Bollinger breakout, Donchian breakout (turtle), MACD signal cross. Parameter sweep (grid) returns a metric table.

## 9. UI

Full color theme with dark and light variants: blue UI accent, green/red for up/down (candles, volume, changes, P&L), distinct default colors per indicator and output, color pickers for drawings and indicator styles; all colors are theme tokens and overridable per layout.
Layout: top toolbar (symbol search, interval buttons, chart type, indicators, undo), left drawing toolbar, center chart, right watchlist panel, bottom backtest panel (strategy, params, costs, run → metrics, equity/drawdown charts, trade list). Keyboard: type to open symbol search, Alt+H horizontal line, Alt+T trend line, Del delete drawing, Esc cancel.

## 10. Acceptance criteria

1. Real data for AAPL, ^NDX, BTCUSDT loads on 1D and 1h; last close matches the provider's quote.
2. Indicator outputs match independent reference implementations to 1e-9 and published worked examples.
3. Drawings persist across reload, timeframe change and symbol round-trip.
4. Watchlists persist across server restart.
5. Backtests: a hand-computed toy scenario reproduces exactly (fills, fees, slippage, equity, drawdown); no look-ahead (shuffling future bars cannot change past decisions).
6. `npm test` green; `npm run build` green; end-to-end smoke in a real browser passes.
