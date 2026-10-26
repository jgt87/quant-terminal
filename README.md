# Quant Terminal

Self-hosted charting and quant research terminal: real market data, candlestick charts, technical indicators,
drawing tools, persistent watchlists and layouts, and a backtesting engine with fees, slippage and drawdowns.

## Run

Double-click **`Start Terminal.cmd`** (or **`Start Terminal (MT5).cmd`** for live FX from a running MetaTrader 5).
It builds the app, starts the local server and opens **http://localhost:4180** in your browser.

> Opening `web/index.html` directly does not work: it is the build template, and the app needs the local
> server for data. Always use the launcher (or `npm run build && npm start`).

Development with hot reload: `npm run dev`, then open http://localhost:5180.

## Requirements
- Node.js 20+ (`npm install` once)
- Optional: MetaTrader 5 running + Python 3.12 (`bridge\setup.cmd` once) for the MT5 feed

## Docs
`docs/SPEC.md` (specification) · `docs/PLAN.md` (status) · `docs/ROADMAP.md` (next features) · `AGENTS.md` (conventions)
