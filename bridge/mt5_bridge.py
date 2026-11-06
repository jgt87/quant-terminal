"""Read-only market-data bridge for a locally running MetaTrader 5 terminal.

Serves JSON on 127.0.0.1 (default port 4191) for the Quant Terminal server:
  GET /health
  GET /symbols?q=EUR            -> [{symbol, description, path, digits, currency}]
  GET /bars?symbol=EURUSD&interval=1h&limit=1000[&to=<utc seconds>]
  GET /quotes?symbols=EURUSD,GBPUSD
  GET /stream?symbols=EURUSD,GBPUSD   (Server-Sent Events: a first "errors" event listing
                                      unknown names, which are skipped; then one "tick"
                                      event per change)

All times in and out are UTC seconds. MT5 reports broker server time, so the bridge
measures the server-to-UTC offset from live ticks and converts both ways.

Safety: the bridge never trades. The MetaTrader5 module is wrapped so that only the
market-data functions in ALLOWED can be called; anything else raises at call time.
"""

from __future__ import annotations

import json
import os
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import MetaTrader5 as _mt5

ALLOWED = {
    "initialize", "shutdown", "last_error", "terminal_info", "version",
    "symbols_get", "symbol_info", "symbol_info_tick", "symbol_select",
    "copy_rates_from", "copy_rates_from_pos", "copy_ticks_from",
}
TIMEFRAME_NAMES = {
    "1m": "TIMEFRAME_M1", "5m": "TIMEFRAME_M5", "15m": "TIMEFRAME_M15", "30m": "TIMEFRAME_M30",
    "1h": "TIMEFRAME_H1", "4h": "TIMEFRAME_H4", "1D": "TIMEFRAME_D1", "1W": "TIMEFRAME_W1", "1M": "TIMEFRAME_MN1",
}
MAX_BARS = 99_999  # requesting exactly the terminal's maxbars returns nothing


class ReadOnlyMT5:
    """Exposes only market-data functions of the MetaTrader5 module."""

    def __getattr__(self, name: str):
        if name.startswith("TIMEFRAME_") or name.startswith("COPY_TICKS_"):
            return getattr(_mt5, name)
        if name not in ALLOWED:
            raise PermissionError(f"MT5 function '{name}' is not allowed in the read-only bridge")
        return getattr(_mt5, name)


mt5 = ReadOnlyMT5()
lock = threading.Lock()  # the MetaTrader5 module is not thread-safe
state = {"offset": int(os.environ.get("MT5_SERVER_UTC_OFFSET_HOURS", "0")) * 3600, "offset_measured": False}


def call(fn: str, *args):
    with lock:
        return getattr(mt5, fn)(*args)


def measure_offset() -> None:
    """Server time minus UTC, rounded to whole hours, from the freshest tick we can see."""
    best = None
    for name in ("EURUSD", "XAUUSD", "BTCUSD", "GBPUSD", "USDJPY"):
        tick = call("symbol_info_tick", name)
        if tick and tick.time:
            best = tick.time if best is None else max(best, tick.time)
    if best is None:
        return
    diff = best - time.time()
    # Only trust a fresh tick (markets open); otherwise keep the previous/env value.
    hours = round(diff / 3600)
    if abs(diff - hours * 3600) < 600:
        state["offset"] = hours * 3600
        state["offset_measured"] = True


def to_utc(server_seconds: int) -> int:
    return int(server_seconds) - state["offset"]


def bars(symbol: str, interval: str, limit: int, to: int | None):
    tf = getattr(mt5, TIMEFRAME_NAMES[interval])
    call("symbol_select", symbol, True)
    limit = max(1, min(limit, MAX_BARS))
    if to is None:
        rates = call("copy_rates_from_pos", symbol, tf, 0, limit)
    else:
        # copy_rates_from includes the bar starting at date_from; ask one extra and drop bars >= to.
        server_to = int(to) if interval in ("1D", "1W", "1M") else int(to) + state["offset"]
        rates = call("copy_rates_from", symbol, tf, server_to - 1, limit + 1)
    if rates is None:
        code, msg = call("last_error")
        raise LookupError(f"no data for {symbol} ({code} {msg})")
    # Daily and longer bars open at broker midnight; stamp them at UTC midnight of that trading
    # date (as the other providers do) instead of shifting them into the previous UTC day.
    stamp = (lambda t: int(t)) if interval in ("1D", "1W", "1M") else to_utc
    out = [
        {
            "time": stamp(r["time"]),
            "open": float(r["open"]),
            "high": float(r["high"]),
            "low": float(r["low"]),
            "close": float(r["close"]),
            "volume": float(r["real_volume"] or r["tick_volume"]),
        }
        for r in rates
    ]
    if to is not None:
        out = [b for b in out if b["time"] < to][-limit:]
    return {"bars": out, "hasMore": len(out) >= limit}


MAX_TICKS = 100_000


def ticks(symbol: str, frm: int, to: int, limit: int):
    """Recorded ticks in [frm, to) (UTC seconds), oldest first: time in UTC ms, last price (bid for
    symbols without trades) and volume. Market data only (copy_ticks_from)."""
    call("symbol_select", symbol, True)
    limit = max(1, min(limit, MAX_TICKS))
    rows = call("copy_ticks_from", symbol, int(frm) + state["offset"], limit + 1, mt5.COPY_TICKS_ALL)
    if rows is None:
        code, msg = call("last_error")
        raise LookupError(f"no ticks for {symbol} ({code} {msg})")
    out = []
    reached_end = False
    for r in rows:
        t = int(r["time_msc"]) - state["offset"] * 1000
        if t >= int(to) * 1000:
            reached_end = True
            break
        price = float(r["last"]) or float(r["bid"])
        if price <= 0:
            continue
        out.append({"time": t, "price": price, "qty": float(r["volume_real"] or r["volume"] or 0)})
    # Fewer rows than asked means no more ticks yet; otherwise complete only if `to` was reached.
    complete = len(rows) <= limit or reached_end
    return {"ticks": out[:limit], "complete": bool(complete)}


def current_server_day() -> int | None:
    """Start of the broker's current trading day (server time), from a symbol that is always live."""
    tick = call("symbol_info_tick", "EURUSD")
    if not tick or not tick.time or abs(tick.time - state["offset"] - time.time()) > 3600:
        return None  # reference not fresh (e.g. weekend): skip the check
    return tick.time - tick.time % 86400


def quote(symbol: str):
    info = call("symbol_info", symbol)
    if info is None:
        return None
    if not info.visible:
        call("symbol_select", symbol, True)
    # A freshly selected symbol returns stale ticks/daily history until the terminal syncs it.
    # Wait (max ~3 s) until its newest daily bar is the broker's current trading day, measured on
    # a symbol that is already live; instruments whose session is closed just time out and use what they have.
    day_start = current_server_day()
    deadline = time.time() + (3.0 if not info.visible else 0.5)
    while True:
        tick = call("symbol_info_tick", symbol)
        d1 = call("copy_rates_from_pos", symbol, _mt5.TIMEFRAME_D1, 0, 2)
        ready = tick and tick.time and d1 is not None and len(d1) == 2
        if ready and (day_start is None or int(d1[1]["time"]) >= day_start):
            # Two independent sources must agree on the previous close: the symbol's
            # session_close (0 until loaded) and yesterday's daily bar.
            session_close = call("symbol_info", symbol).session_close
            if session_close and abs(session_close - float(d1[0]["close"])) <= 1e-9 * max(1.0, session_close):
                break
        if time.time() > deadline:
            break
        time.sleep(0.2)
    snapshot = (int(d1[0]["time"]), float(d1[0]["close"]), int(d1[1]["time"])) if ready else None
    if not tick or not tick.time:
        return None
    prev = snapshot[1] if snapshot else None
    last = float(tick.bid or tick.last)
    change = last - prev if prev else 0.0
    return {
        "symbol": symbol,
        "last": last,
        "bid": float(tick.bid),
        "ask": float(tick.ask),
        "change": change,
        "changePct": (change / prev * 100) if prev else 0.0,
        "time": to_utc(tick.time),
    }


def symbols(q: str):
    q = q.upper()
    result = []
    for s in call("symbols_get") or ():
        if q and q not in s.name.upper() and q not in (s.description or "").upper():
            continue
        result.append({
            "symbol": s.name,
            "description": s.description,
            "path": s.path,
            "digits": s.digits,
            "currency": s.currency_profit,
        })
        if len(result) >= 50:
            break
    # Exact and prefix matches first.
    result.sort(key=lambda r: (r["symbol"].upper() != q, not r["symbol"].upper().startswith(q), r["symbol"]))
    return result


class Handler(BaseHTTPRequestHandler):
    server_version = "mt5-bridge"

    def log_message(self, fmt, *args):  # quiet
        pass

    def send_json(self, status: int, body) -> None:
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):  # noqa: N802
        url = urlparse(self.path)
        qs = {k: v[0] for k, v in parse_qs(url.query).items()}
        try:
            if url.path == "/health":
                info = call("terminal_info")
                self.send_json(200, {
                    "ok": bool(info and info.connected),
                    "terminal": info.name if info else None,
                    "offsetHours": state["offset"] / 3600,
                    "offsetMeasured": state["offset_measured"],
                })
            elif url.path == "/symbols":
                self.send_json(200, symbols(qs.get("q", "")))
            elif url.path == "/bars":
                interval = qs.get("interval", "1D")
                if interval not in TIMEFRAME_NAMES:
                    return self.send_json(400, {"error": f"bad interval {interval}"})
                to = int(qs["to"]) if qs.get("to") else None
                self.send_json(200, bars(qs["symbol"], interval, int(qs.get("limit", "1000")), to))
            elif url.path == "/ticks":
                self.send_json(200, ticks(qs["symbol"], int(qs["from"]), int(qs["to"]), int(qs.get("limit", "20000"))))
            elif url.path == "/quotes":
                names = [s for s in qs.get("symbols", "").split(",") if s]
                self.send_json(200, [q for q in (quote(s) for s in names) if q])
            elif url.path == "/stream":
                self.stream([s for s in qs.get("symbols", "").split(",") if s])
            else:
                self.send_json(404, {"error": "not found"})
        except LookupError as e:
            self.send_json(404, {"error": str(e)})
        except (KeyError, ValueError) as e:
            self.send_json(400, {"error": f"bad request: {e}"})
        except (BrokenPipeError, ConnectionResetError):
            pass

    def stream(self, names: list[str]) -> None:
        # Unknown names are reported in a first "errors" event and skipped; the rest stream.
        known: list[str] = []
        unknown: list[str] = []
        for s in dict.fromkeys(names):
            try:
                info = call("symbol_info", s)
            except Exception:  # noqa: BLE001 - one bad name never ends the stream
                info = None
            (known if info is not None else unknown).append(s)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(f"event: errors\ndata: {json.dumps({'symbols': unknown})}\n\n".encode())
        self.wfile.flush()
        for s in known:
            call("symbol_select", s, True)
        last: dict[str, int] = {}
        idle = 0.0
        while True:
            sent = False
            for s in known:
                try:
                    tick = call("symbol_info_tick", s)
                except Exception:  # noqa: BLE001
                    tick = None
                if tick and tick.time_msc != last.get(s):
                    last[s] = tick.time_msc
                    payload = {"symbol": s, "bid": tick.bid, "ask": tick.ask, "last": tick.bid or tick.last,
                               "time": to_utc(tick.time), "timeMs": tick.time_msc - state["offset"] * 1000}
                    self.wfile.write(f"event: tick\ndata: {json.dumps(payload)}\n\n".encode())
                    sent = True
            idle = 0.0 if sent else idle + 0.25
            if idle >= 15:  # keep-alive comment so proxies keep the connection open
                self.wfile.write(b": ping\n\n")
                idle = 0.0
            self.wfile.flush()
            time.sleep(0.25)


def main() -> None:
    if not call("initialize"):
        raise SystemExit(f"MT5 initialize failed: {call('last_error')}")
    measure_offset()

    def remeasure():
        while True:
            time.sleep(600)
            measure_offset()

    threading.Thread(target=remeasure, daemon=True).start()
    port = int(os.environ.get("MT5_BRIDGE_PORT", "4191"))
    print(f"mt5 bridge on http://127.0.0.1:{port} (server offset {state['offset'] / 3600:+.0f}h, measured={state['offset_measured']})")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()


if __name__ == "__main__":
    main()
