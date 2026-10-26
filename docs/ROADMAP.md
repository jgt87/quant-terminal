# Roadmap — features beyond the core

Source of the feature list: the public plan-comparison page of a commercial charting service (feature names only).
Everything here is built from public definitions; no third-party code. Plan limits do not exist in this app.

Legend: **Core** = in the first build · **Next** = buildable with current free data · **Data** = needs a data source we don't have yet · **Skip** = social/broker/platform features out of scope.

## Limits that simply disappear (Core)
Charts per tab, indicators per chart, indicator-on-indicator, saved layouts, watchlists and symbols per list, historical bars on chart, alert counts and durations — all unlimited (bounded only by memory and provider history).

## Charts
| Feature | Status | Notes |
|---|---|---|
| Multi-chart layouts (2/4/8/16 per tab), symbol/interval/crosshair sync | Next | Grid of ChartEngine instances sharing a link group |
| Custom time intervals (e.g. 2h, 3D, 45m) | Next | Aggregate from the nearest finer provider interval |
| Second-based / tick intervals | Data | Crypto possible via Binance trades/aggTrades stream; stocks need a paid feed |
| Renko, Kagi, Line Break, Point & Figure, range bars (incl. intraday) | Next | Pure transforms of OHLC in `core/transforms/` |
| Spread/ratio charts from formulas (e.g. `AAPL/MSFT`, `BTCUSDT-ETHUSDT`) | Next | Expression parser over aligned series |
| Compare symbols (% overlay) | Next | Rebased overlay series |
| Dividend-adjusted charts; earnings/splits/dividends markers | Next | Yahoo chart `events=div,splits` + adjclose |
| Extended trading hours | Next | Yahoo `includePrePost=true` |
| Download chart data (CSV) | Next | Export visible or full series |
| Nested drawing groups, drawing templates | Next | Layout schema extension |
| Bar Replay (+ indicators in replay, trading in replay) | Next | Replay cursor over cached bars; paper fills reuse the backtest fill model |

## Indicators & analysis
| Feature | Status | Notes |
|---|---|---|
| Volume Profile (fixed range, visible range, session, anchored) | Next | Volume binned by price; intraday-bar approximation, exact with finer data |
| TPO / Market Profile | Next | Letter blocks per 30-min period from intraday bars |
| Volume footprint | Data | Needs bid/ask-classified trades; crypto feasible via Binance aggTrades (buyer-maker flag) |
| Volume candles (width by volume) | Next | Renderer variant |
| Candlestick pattern recognition | Next | Rule-based detectors (engulfing, doji, hammer, stars, …) |
| Auto Fib retracement, auto chart patterns (triangles, H&S, wedges, double tops) | Next | Pivot (zig-zag) detection + geometric rules |
| Multi-timeframe indicators | Next | Compute on higher-interval series, step-align to chart bars without look-ahead |
| Custom indicator templates | Next | Saved indicator sets |
| Scripting language for user indicators/strategies | Next | Sandboxed TypeScript/JS user scripts against the core API (Web Worker) |

## Backtesting
| Feature | Status | Notes |
|---|---|---|
| Strategy backtesting, basic + advanced report metrics | Core | Done |
| Export trades CSV / report XLSX | Next | CSV first; XLSX via a small writer |
| Deep backtesting (full history) | Core | Server pages full history into cache |
| Intrabar ("bar magnifier") / per-tick execution | Next/Data | Use finer-interval bars inside each bar for fill order; ticks for crypto |
| Parameter optimization | Core | `sweepParams`; add walk-forward and out-of-sample split |

## Alerts
| Feature | Status | Notes |
|---|---|---|
| Price, indicator, drawing (line-cross) alerts | Next | Server-side evaluator on each poll |
| Multi-condition alerts, alerts on watchlists | Next | Condition tree over symbols |
| Webhook notifications | Next | POST JSON to user URL |
| Second-based alerts | Data | Needs streaming feed |
| Desktop notifications | Next | Browser Notification API |

## Data, screeners, portfolios
| Feature | Status | Notes |
|---|---|---|
| Screener (technical fields over a universe) | Next | Run indicators over a symbol universe on cached daily bars |
| Fundamentals on charts / screener fields | Data | Yahoo quoteSummary covers part; full coverage needs a fundamentals API |
| Economic & earnings calendars, news | Data | Needs a calendar/news API |
| Yield curves | Data | Treasury rates (public US Treasury data can cover US) |
| Portfolios (holdings, transactions, P&L) | Next | Store + quotes |
| Paper trading, chart trading, DOM | Next (paper) / Skip (broker DOM) | Paper account reuses fill model |
| Watchlist import/export, custom columns, flags, sorting | Next | |

## Out of scope (Skip)
Broker trading, community contests, publishing ideas/scripts, badges, ad-free, mobile apps and widgets, priority support.

## Not obtainable
Third-party paid or protected scripts: their source runs server-side and is not distributed. Equivalent behavior can be implemented from the author's public description, or ported if the author publishes the source under a compatible license.
