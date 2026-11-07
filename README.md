# Quant Terminal

Self-hosted charting and quant research terminal that runs on your own machine: candlestick charts on its own
canvas engine, technical indicators, a large set of drawing tools, multi-chart layouts, watchlists, alerts,
a screener, portfolios, paper trading, user scripts and a backtesting engine with fees, slippage and drawdowns.

![Quant Terminal: Nasdaq-100 daily chart with EMA 20, volume, RSI and the watchlist](docs/screenshot.png)

> **Market data notice.** Quant Terminal ships **without any commercial or licensed datafeed**: no API keys, no
> paid subscriptions, no exchange data agreements. Out of the box it reads public, keyless endpoints of Yahoo
> Finance, Binance and Deriv, and optionally your own MetaTrader 5 terminal. The MT5 bridge and Deriv give
> tick-by-tick live prices; Yahoo data can be delayed and is never a broker feed. See [Market data](#market-data) for
> the details and limitations before relying on any price shown.

## Features

- **Charts:** candles, hollow candles, bars, line, area, baseline, columns, volume candles, HLC area, high-low,
  line with markers, step line, Heikin-Ashi, smoothed Heikin-Ashi, Renko, Kagi, Line Break, Point & Figure and Range; log, percent,
  indexed-to-100 and inverted scales; price axis on the left, right or both sides; indicators can share panes or use
  their own (left or hidden) scale; panes maximise and collapse; symbol compare, custom intervals, bar replay (also
  tick by tick for Binance and MT5), live ticks for MT5 and Deriv symbols, chart time zones (UTC, local, exchange or a named zone) with session breaks,
  countdown to bar close, high and low labels, go to date, symbol watermark, full screen, dark, light and high-contrast themes.
- **Indicators and studies:** 82 built-in indicators: moving averages (SMA, EMA, WMA, DEMA, TEMA, Hull, ALMA, KAMA,
  LSMA, SMMA, VWMA, McGinley, ZLEMA, VIDYA), bands and trend overlays (Bollinger, Keltner, Donchian, Envelope,
  Ichimoku, SuperTrend, Parabolic SAR, Chandelier Exit, Chande Kroll Stop, Price Channel, Linear Regression Channel,
  Standard Error Bands, VWAP), momentum (RSI, MACD, Stochastic, Stochastic RSI, CCI, Williams %R, ROC, Awesome,
  Accelerator, TRIX, Ultimate, TSI, Coppock, Connors RSI, Fisher, Schaff, KST, Relative Vigor, Rank Correlation, …),
  trend strength (DMI/ADX, Aroon, Vortex, Choppiness), volatility and volume (ATR, Historical Volatility, Mass Index,
  Ulcer Index, OBV, MFI, CMF, A/D, Chaikin, Klinger, Force Index, Volume Oscillator, Net Volume, …), period levels
  (Pivot Points Standard in six formulas, previous day/week/month high-low-close), Williams Alligator and Fractals,
  Squeeze Momentum, SMI Ergodic and Woodies CCI, plus volume profile, TPO, pivots, auto Fibonacci, gaps, auto support and resistance and candlestick / chart pattern detection; indicator sets save
  as templates. The Ichimoku cloud is drawn ahead
  of the last bar.
- **Crypto order flow (Binance):** footprint bars, volume bubbles, delta and cumulative delta panes, a live order
  book with a liquidity heatmap (recordable and replayable with bar replay), a depth ladder for paper orders,
  absorption / stop-run / iceberg signals (also as alert conditions) and a time and sales panel.
- **Options (Binance):** option chains with IV and greeks, open interest and volume by strike, volatility smile and
  term structure.
- **Drawing tools:** lines, channels, pitchforks, Fibonacci and Gann tools, Elliott waves, harmonic patterns,
  cycles, shapes, brushes, text and notes, icons, long/short position and measuring tools; anchors are stored in
  price/time so drawings survive zoom, timeframe changes and reloads; templates, visibility per interval, object tree.
- **Workspace:** tabs and multi-chart grids with linked symbol, interval, crosshair and time range (link groups or a
  tab-wide time sync), a ticker tape of the first watchlist; layouts and watchlists are autosaved to a local JSON store; a tab with all its charts can be
  exported to a file and imported again.
- **Alerts:** price, indicator and drawing conditions (also straight from an indicator's chart menu), browser
  notifications, sounds and webhooks.
- **Research:** screener over built-in universes, portfolios with transactions, simulated paper trading (market,
  limit, stop, stop-limit and trailing stop orders, brackets, one-click buy / sell buttons on the chart and a trade
  journal with notes, tags and statistics; order and position lines on the chart that you drag to modify), and
  user scripts (indicators and strategies) running in a sandboxed Web Worker.
- **Backtesting:** bar-by-bar engine without look-ahead, commission, slippage and spread, position sizing,
  stop-loss / take-profit, equity and drawdown curves, Sharpe, Sortino, Calmar and more, parameter sweeps and
  walk-forward tests.
- **Export:** chart PNG and SVG, CSV of bars and indicator values, and a data table panel.

## Run

Install with git so the launcher can keep it up to date:

```
git clone https://github.com/jgt87/quant-terminal.git
```

Then double-click **`Start Terminal.cmd`** (or **`Start Terminal (MT5).cmd`** for live prices from a running
MetaTrader 5, or **`Start Terminal (Deriv FX).cmd`** for live forex prices from Deriv without any account). It updates to the latest release, installs the dependencies, builds the app, starts the local server
and opens **http://localhost:4180** in your browser once it is ready. Keep its window open while you use the
terminal; closing it stops the server.

### What a start does
Every `Start Terminal*.cmd` is a short stub that runs the same launcher, `tools/launch.mjs`, with its mode
(`--fx mt5`, `--fx deriv`), so all of them update and check the same way:

1. **Update.** It fetches the release tags and fast-forwards to the newest release (`vX.Y.Z`), then hands over to
   the updated launcher, which shows a short **What's new** from `CHANGELOG.md` for the versions in between. It
   never discards work: it only updates on branch `main` with no changes to tracked files and only by
   fast-forward, and otherwise says why it skipped. When offline it starts the installed version. A ZIP download
   cannot update itself; the launcher tells you when a newer release is available.
2. **Check this computer.** Node.js for the mode, npm and Git, plus Python 3.12 and a running MT5 terminal for the
   MT5 launcher, or Deriv's reachability for the Deriv one. Anything essential missing stops the start with what
   to install.
3. **Already running?** The same version is opened in the browser. An older one (it keeps serving its old code
   after an update) is stopped and replaced; its window says so. Another program on the port stops the start
   (use `set PORT=4181`).
4. **Dependencies** are installed with `npm ci` (exactly what `package-lock.json` pins) when the lockfile changed or
   the install lost files, then the app is built and the server started.

Options for any launcher: `--check` (only the update and the computer check), `--no-update` (or
`QT_NO_UPDATE=1`), `--no-browser`. From a terminal: `node tools/launch.mjs --check`.

From a terminal:

```
npm install
npm run build
npm start          # http://localhost:4180
```

> Opening `web/index.html` directly does not work: it is the build template, and the app needs the local
> server for data. Always use the launcher (or `npm run build && npm start`).

Development with hot reload: `npm run dev`, then open http://localhost:5180.

### Requirements
- Node.js 20.19+ or 22.12+ (running the tests and the Deriv feed need 22.12+: Node 20 has no built-in WebSocket)
- Git, for automatic updates (optional)
- Optional, for the MT5 feed: Windows, MetaTrader 5 installed, running and logged in, and 64-bit Python 3.12
  (`bridge\setup.cmd` once)

## Market data

The server picks a source per symbol. Everything is cached on disk in `data/cache` (not part of the repo).

| Source | Symbols | Key needed | Real-time? |
|---|---|---|---|
| Yahoo Finance (public chart endpoint) | stocks, ETFs, indices (`AAPL`, `^NDX`), FX (`EURUSD=X`), anything else | no | **no**: delayed or indicative, polled |
| Binance (public REST API) | crypto pairs (`BTCUSDT`, `BINANCE:ETHUSDT`) | no | prices are live at the source, but the app polls |
| Binance (public WebSocket streams) | order book and trades of the pairs whose heatmap, depth ladder or signals are open | no | **yes**: 100 ms depth updates |
| Binance options (public REST API) | option chains of BTC, ETH, BNB, SOL, XRP, DOGE, gold, silver | no | quotes cached for 15 s |
| MetaTrader 5 (local bridge) | `MT5:<broker symbol>`, optionally all FX pairs | no (your own logged-in terminal) | **yes**: tick stream |
| Deriv (public WebSocket) | `DERIV:EURUSD`, `DERIV:XAUUSD`, `DERIV:OTC_NDX`, `DERIV:BTCUSD`, `DERIV:R_100`; optionally all FX pairs | no (no account, token or app id) | **yes**: tick stream |

### No datafeed API included

There is no paid or licensed market-data provider in this project, and nothing is connected to one. Yahoo,
Binance and Deriv are used through their public endpoints without an account. If you need guaranteed, licensed real-time
data, add a provider in `server/src/providers/` (the `Provider` interface: symbol search, bars, quotes) and route
symbols to it in `server/src/providers/index.ts`.

### Yahoo Finance limitations

Yahoo's chart endpoint is unofficial and undocumented. It has no service level, can change or break without
notice, rate-limits heavy use (the app then reports "Yahoo rate limit reached"), and Yahoo's terms allow personal
use only. In practice:

- **Not tick data, not a broker feed.** The app polls for new bars (see below) and there is no bid/ask, spread or
  market depth.
- **Stocks:** US-listed stocks are usually close to real time during regular hours, but the price comes from
  Yahoo's own feed, not a full consolidated tape, so last price and intraday volume can differ from your broker.
  Many non-US exchanges and some indices are **delayed by 15–20 minutes** or more (Yahoo lists the delay per
  exchange). Pre- and post-market bars are only included when extended hours are switched on.
- **Forex (`EURUSD=X` and pairs routed to Yahoo):** rates are **indicative**: an aggregated mid price, not a
  tradable bid/ask from a liquidity provider. They update less often than a broker feed, volume is zero, and
  candles can differ from your broker's (different price source and session times; bars here are in UTC).
  For live FX, use the MT5 bridge.
- **Intraday history is short:** about 7 days of 1-minute bars, 60 days of 5 to 30-minute bars and 730 days of
  1-hour bars. Daily and longer intervals go back to the listing date.
- **Refresh rate in this app:** charts poll every 5 s (intraday) or 30 s (daily and longer), but the server reuses
  the latest page for up to **30 s** on intraday intervals and **15 min** on daily and longer intervals; watchlist
  quotes refresh every 10 s. Yahoo prices on screen can therefore lag the source by up to these intervals, on top
  of any exchange delay.

### Binance limitations

Binance prices are real time at the source, but the app polls the public REST API with the same refresh rates as
above (there is no Binance websocket stream), so a candle can lag by up to 30 s. `api.binance.com` is not
reachable from some regions (for example the US). Only crypto pairs listed on Binance are available.

### Deriv (live forex without an account)

Deriv's public WebSocket (`wss://api.derivws.com/trading/v1/options/ws/public`) serves prices without an account,
API token, app id or demo login. The server keeps one connection open while it is used, spaces requests out to
stay under Deriv's rate limit, reconnects after a drop and restores live subscriptions.

- **Symbols:** `DERIV:<name>`. Forex: the 25 pairs Deriv lists (majors and minors such as `DERIV:EURUSD`,
  `DERIV:USDJPY`, `DERIV:AUDNZD`, `DERIV:USDMXN`, `DERIV:USDPLN`); many other pairs (for example `DERIV:USDZAR`,
  `DERIV:USDTRY`, `DERIV:EURSEK`, `DERIV:USDCNH`) have history but are not listed, so live prices may not arrive.
  Metals `DERIV:XAUUSD`, `XAGUSD`, `XPTUSD`, `XPDUSD`; 12 stock indices (`DERIV:OTC_NDX`, `OTC_SPC`, `OTC_DJI`,
  `OTC_GDAXI`, `OTC_FTSE`, `OTC_N225`, ...); `DERIV:BTCUSD`, `DERIV:ETHUSD`; and Deriv's synthetic indices
  (`DERIV:R_100`, `DERIV:1HZ100V`, ...), which are generated by Deriv, not real markets. Symbol search lists them.
- **Forex routing:** `Start Terminal (Deriv FX).cmd` (or `QT_FX_PROVIDER=deriv`) sends `EURUSD=X`, `FX:EURUSD`
  and `OANDA:EURUSD` to Deriv. `YAHOO:EURUSD=X` still reaches Yahoo in every mode.
- **Limits, shown in the app as "Data limit" notices when you run into them:** history goes back **one year**
  (all intervals); there is **no volume**; weekly and monthly bars are built from daily bars; forex, metals and
  indices are closed at the weekend and outside their hours (charts update when the market reopens); order flow,
  the liquidity heatmap, order-flow signals and tick replay need trades and an order book, which Deriv does not
  provide. Prices are Deriv's own quotes, not exchange data, so they can differ slightly from your broker.
- Needs Node.js 22 or newer (built-in WebSocket).

## MetaTrader 5 bridge (live prices)

`bridge/mt5_bridge.py` relays market data from a MetaTrader 5 terminal running on the same machine. It uses the
official `MetaTrader5` Python package, which talks to the installed terminal; whatever account that terminal is
logged into (demo or live) supplies the prices, so you see exactly your broker's quotes and symbols.

```
MT5 terminal  ──>  bridge (Python, 127.0.0.1:4191)  ──>  Quant Terminal server (:4180)  ──>  browser
                     /symbols /bars /quotes /stream        /api/bars /api/quotes /api/stream (SSE)
```

- **Real time:** `/stream` pushes every tick change as Server-Sent Events; the server relays it on
  `GET /api/stream?symbols=MT5:EURUSD,...` and the watchlist and charts update tick by tick. Polling stays as the
  resync after a reconnect.
- **Read-only by construction:** the `MetaTrader5` module is wrapped in an allow-list of market-data functions
  (symbols, ticks, rates). Order and position functions raise when called, so the bridge cannot trade or read
  account details. It only listens on 127.0.0.1.
- **Time zones:** MT5 reports broker server time. The bridge measures the offset from live ticks and returns UTC;
  daily, weekly and monthly bars are stamped at UTC midnight of the trading date, like the other sources.
- **Symbols:** use `MT5:<broker name>`, for example `MT5:EURUSD` or a broker-specific name such as `MT5:AAPL.NAS`.
  Availability depends on your broker. Set `QT_FX_PROVIDER=mt5` (the MT5 launcher does this) to also route
  `EURUSD=X`, `FX:EURUSD` and `OANDA:EURUSD` to MT5 instead of Yahoo.
- **History depth** follows the terminal's "Max bars in chart" setting and what the broker provides.

### Setup
1. Install MetaTrader 5, log in to an account (a demo account works) and keep the terminal open.
2. Run `bridge\setup.cmd` once (creates `bridge\.venv` with 64-bit Python 3.12 and installs `MetaTrader5`).
3. Start everything with `Start Terminal (MT5).cmd`.

The bridge port can be changed with `MT5_BRIDGE_PORT`, and the server's bridge address with `MT5_BRIDGE_URL`
(default `http://127.0.0.1:4191`).

## Project layout

- `core/`: pure TypeScript shared by server and web: types, indicators, chart transforms, drawing geometry,
  backtesting.
- `server/`: Node HTTP API on port 4180 (market data, disk cache, JSON store, alerts, screener, portfolios,
  paper trading); also serves the built web app.
- `web/`: React + Vite app with its own canvas chart engine (`web/src/chart/`).
- `bridge/`: the MetaTrader 5 market-data bridge.
- `tools/`: launcher helpers (`update.mjs` auto-updater, `ensure-deps.mjs`), browser end-to-end checks and screenshot sheets.

Commands: `npm test` · `npm run typecheck` · `npm run build` · `npm run dev`.

## Docs
`docs/SPEC.md` (specification) · `docs/PLAN.md` (status) · `docs/ROADMAP.md` (next features) ·
`CHANGELOG.md` · `AGENTS.md` (conventions)

## Disclaimer

For research and education. Prices may be delayed, incomplete or wrong; nothing here is investment advice, and
backtest and paper-trading results do not predict real results.
