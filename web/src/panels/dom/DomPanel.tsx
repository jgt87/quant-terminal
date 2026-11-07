// Depth ladder (Binance symbols): live bid / ask size per price row around the mid, with the
// selected paper account's working orders in their rows. Click a bid / ask cell to place a
// simulated order there, drag an order to another row to move it, × cancels. Paper trading only:
// nothing reaches a broker.

import { useEffect, useMemo, useRef, useState } from "react";
import { isDepthRecording, loadDepthRecordings, setDepthRecording, streamBook, type BookView } from "../../api/depth";
import { errorText } from "../../api/http";
import { cancelPaperOrder, closePaperPosition, getPaper, listPaper, modifyPaperOrder, placePaperOrder, type PaperAccountView, type PaperOrderRequest } from "../../api/paper";
import { formatPrice } from "../../chart/format";
import { shortVolume } from "../../chart/renderers/footprint";
import { PAPER_POLL_MS, PAPER_SELECTED_KEY } from "../../hooks/paper";
import { isBinanceSymbol } from "../../state/chartMenuFor";
import { loadLocal, saveLocal } from "../common/storage";
import { pushToast } from "../common/toasts";
import { clickOrder, dragPatch, frameBook, ladderRows, ladderSteps, rowKey } from "./domModel";
import type { ActiveChartHandles } from "../registry";
import { t } from "../../i18n";
import "./dom.css";

const ROWS = 41;
const ROW_H = 20;
const QTY_KEY = "qt.dom.qty";
const STEP_KEY = "qt.dom.stepIndex";

const MODE_TEXT: Record<BookView["mode"], string> = { connecting: "Connecting", stream: "Live", poll: "Polling", stopped: "Stopped", replay: "Replay" };

export function DomPanel({ symbol, visible, chart }: { symbol: string; visible: boolean; chart?: ActiveChartHandles | null }) {
  const ok = isBinanceSymbol(symbol);
  const [liveBook, setBook] = useState<BookView | null>(null);
  const [replayBook, setReplayBook] = useState<BookView | null>(null);
  const [inReplay, setInReplay] = useState(false);
  const book = inReplay ? replayBook : liveBook;
  const [stepIndex, setStepIndex] = useState(() => loadLocal<number>(STEP_KEY, 3));
  const [qty, setQty] = useState(() => loadLocal<number>(QTY_KEY, 0.01));
  const [account, setAccount] = useState<PaperAccountView | null>(null);
  const [center, setCenter] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const priceRef = useRef<number | null>(null);

  // Steps follow the price; the chosen index is kept.
  const steps = useMemo(() => {
    const p = priceRef.current ?? book?.bid ?? null;
    if (p != null) priceRef.current = p;
    return p != null ? ladderSteps(p) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, book != null]);
  const step = steps[Math.min(stepIndex, steps.length - 1)] ?? 0;

  useEffect(() => {
    priceRef.current = null;
    setBook(null);
    setCenter(null);
    setError(null);
  }, [symbol]);

  useEffect(() => {
    if (!visible || !ok || inReplay) return;
    return streamBook(symbol, setBook, 120, step);
  }, [symbol, visible, ok, step, inReplay]);

  // Bar Replay on the active chart: the recorded book at the replay clock (from the heatmap frames).
  const engine = chart?.engine ?? null;
  useEffect(() => {
    if (!visible || !ok || !engine) return;
    const sync = () => {
      const on = engine.replay.phase === "on";
      setInReplay(on);
      if (!on) return;
      const frames = engine.visibleDepthFrames();
      setReplayBook(frameBook(frames[frames.length - 1], symbol));
    };
    sync();
    const t = window.setInterval(sync, 250);
    return () => window.clearInterval(t);
  }, [engine, symbol, visible, ok]);

  useEffect(() => {
    if (!visible || !ok) return;
    void loadDepthRecordings().then(() => setRecording(isDepthRecording(symbol)));
  }, [symbol, visible, ok]);

  // The selected paper account, polled while visible.
  useEffect(() => {
    if (!visible || !ok) return;
    let alive = true;
    let timer = 0;
    let id: string | null = null;
    const tick = async () => {
      try {
        if (!id) {
          const list = await listPaper();
          const want = loadLocal<string | null>(PAPER_SELECTED_KEY, null);
          id = (list.find((a) => a.id === want) ?? list[0])?.id ?? null;
        }
        const acc = id ? await getPaper(id) : null;
        if (alive) setAccount(acc);
      } catch {
        /* the ladder still shows the book */
      }
      if (alive) timer = window.setTimeout(tick, PAPER_POLL_MS);
    };
    void tick();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [symbol, visible, ok]);

  const position = account ? (Object.entries(account.positions).find(([s]) => s.trim().toUpperCase() === symbol.trim().toUpperCase())?.[1] ?? null) : null;
  const rows = useMemo(() => ladderRows(book, step, ROWS, account?.orders ?? [], symbol, position, center ?? undefined), [book, step, account, symbol, position, center]);
  const maxSize = useMemo(() => rows.reduce((m, r) => Math.max(m, r.bid, r.ask), 0), [rows]);
  /** Decimals of the step (0.25 → 2, 10 → 0). */
  const decimals = step > 0 ? Math.max(0, Math.min(8, (String(step).split(".")[1] ?? "").length)) : 2;
  const fmt = (p: number) => formatPrice(p, decimals);

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      setError(null);
      if (account) setAccount(await getPaper(account.id));
    } catch (e) {
      setError(`${label}: ${errorText(e)}`);
      pushToast({ title: `${label} failed`, body: errorText(e), tone: "error" });
    }
  };
  const place = (o: PaperOrderRequest) => account && run("Order", () => placePaperOrder(account.id, o));

  if (!ok) {
    return (
      <section className="pn dom-panel" aria-label="Depth ladder">
        <header className="pn-head">
          <h3>{t("Depth ladder")}</h3>
        </header>
        <div className="pn-empty">The depth ladder needs a Binance symbol (for example BINANCE:BTCUSDT).</div>
      </section>
    );
  }

  const onWheel = (e: React.WheelEvent) => {
    if (!step || !rows.length) return;
    const mid = center ?? rows[Math.floor(rows.length / 2)].price;
    setCenter(Number((mid + Math.sign(e.deltaY) * -3 * step).toPrecision(12)));
  };

  return (
    <section className="pn dom-panel" aria-label="Depth ladder">
      <header className="pn-head">
        <h3>{t("Depth ladder")}</h3>
        <span className="dom-symbol">{symbol}</span>
        {book && <span className={`dom-mode dom-mode-${book.mode}`}>{t(MODE_TEXT[book.mode])}</span>}
        <span className="spacer" />
        <label className="dom-field" title="Price rows grouped by this step">
          {t("Step")}
          <select
            value={Math.min(stepIndex, Math.max(0, steps.length - 1))}
            onChange={(e) => {
              const i = Number(e.target.value);
              setStepIndex(i);
              saveLocal(STEP_KEY, i);
              setCenter(null);
            }}
          >
            {steps.map((s, i) => (
              <option key={s} value={i}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button
          className={`dom-btn${recording ? " on" : ""}`}
          title="Record this order book to disk (heatmap history and depth replay)"
          aria-pressed={recording}
          onClick={() =>
            void setDepthRecording(symbol, !recording)
              .then(() => setRecording(isDepthRecording(symbol)))
              .catch((e) => setError(errorText(e)))
          }
        >
          {recording ? t("● Recording") : t("Record")}
        </button>
      </header>
      <div className="dom-trade" aria-label="Paper trading (simulated)">
        <span className="dom-account" title="Selected paper account (simulated)">
          {account ? `${account.name} · ${t("simulated")}` : t("No paper account")}
        </span>
        <label className="dom-field">
          {t("Qty")}
          <input
            type="number"
            min={0}
            step="any"
            value={qty}
            onChange={(e) => {
              const v = Math.max(0, Number(e.target.value) || 0);
              setQty(v);
              saveLocal(QTY_KEY, v);
            }}
          />
        </label>
        <button className="dom-btn buy" disabled={!account || !(qty > 0)} onClick={() => place({ symbol, side: "buy", type: "market", qty })}>
          {t("Buy MKT")}
        </button>
        <button className="dom-btn sell" disabled={!account || !(qty > 0)} onClick={() => place({ symbol, side: "sell", type: "market", qty })}>
          {t("Sell MKT")}
        </button>
        <button className="dom-btn" disabled={!account || !position || position.qty === 0} onClick={() => account && run("Flatten", () => closePaperPosition(account.id, symbol))}>
          {t("Flatten")}
        </button>
        <button
          className="dom-btn"
          disabled={!account}
          onClick={() => {
            if (!account) return;
            const mine = account.orders.filter((o) => o.status === "working" && o.symbol.trim().toUpperCase() === symbol.trim().toUpperCase());
            void run("Cancel", () => Promise.all(mine.map((o) => cancelPaperOrder(account.id, o.id))));
          }}
        >
          {t("Cancel all")}
        </button>
      </div>
      {position && position.qty !== 0 && (
        <div className="dom-position">
          {position.qty > 0 ? "Long" : "Short"} {Math.abs(position.qty)} @ {fmt(position.avgPrice)}
          {position.unrealizedPnl != null && <b className={position.unrealizedPnl >= 0 ? "pos" : "neg"}> {position.unrealizedPnl >= 0 ? "+" : ""}{position.unrealizedPnl.toFixed(2)}</b>}
        </div>
      )}
      {error && <div className="pn-error">{error}</div>}
      <div className="dom-head" role="row">
        <span>{t("Buy")}</span>
        <span>{t("Bid")}</span>
        <span>{t("Price")}</span>
        <span>{t("Ask")}</span>
        <span>{t("Sell")}</span>
      </div>
      <div className="dom-ladder" onWheel={onWheel} role="grid" aria-label="Order book by price" onPointerLeave={() => setDrag(null)}>
        {!book && <div className="pn-empty">{inReplay ? "No recorded order book at the replay time (turn on Liquidity heatmap and record the pair)." : "Loading the order book…"}</div>}
        {rows.map((r) => {
          const onDrop = () => {
            if (!drag || !account) return;
            const o = account.orders.find((x) => x.id === drag);
            setDrag(null);
            if (!o || o.price === undefined || rowKey(o.price, step) === rowKey(r.price, step)) return;
            const { orderId, patch } = dragPatch(o.id, r.price);
            void run("Move order", () => modifyPaperOrder(account.id, orderId, patch));
          };
          const chips = (list: typeof r.buys) =>
            list.map((o) => (
              <span
                key={o.id}
                className={`dom-chip ${o.side}${o.leg ? ` leg-${o.leg}` : ""}`}
                title={`${o.side === "buy" ? "Buy" : "Sell"} ${o.type} ${o.qty}: drag to move`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  setDrag(o.id);
                }}
              >
                {o.leg === "stop-loss" ? "SL " : o.leg === "take-profit" ? "TP " : ""}
                {o.qty}
                <button
                  className="dom-x"
                  title="Cancel"
                  aria-label="Cancel order"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (account) void run("Cancel", () => cancelPaperOrder(account.id, o.id));
                  }}
                >
                  ×
                </button>
              </span>
            ));
          const bar = (v: number) => (maxSize > 0 ? `${Math.round((v / maxSize) * 100)}%` : "0%");
          return (
            <div
              key={r.price}
              className={`dom-row${r.bestBid ? " best-bid" : ""}${r.bestAsk ? " best-ask" : ""}${r.position ? " has-pos" : ""}${drag ? " dropping" : ""}`}
              style={{ height: ROW_H }}
              role="row"
              onPointerUp={onDrop}
            >
              <span className="dom-mine">{chips(r.buys)}</span>
              <button className="dom-cell bid" disabled={inReplay || !account || !(qty > 0)} title={`Buy ${qty} at ${fmt(r.price)}`} onClick={() => book && place(clickOrder("buy", r.price, book, qty, symbol))}>
                <i style={{ width: bar(r.bid) }} />
                <span>{r.bid > 0 ? shortVolume(r.bid) : ""}</span>
              </button>
              <span className="dom-price">{fmt(r.price)}</span>
              <button className="dom-cell ask" disabled={inReplay || !account || !(qty > 0)} title={`Sell ${qty} at ${fmt(r.price)}`} onClick={() => book && place(clickOrder("sell", r.price, book, qty, symbol))}>
                <i style={{ width: bar(r.ask) }} />
                <span>{r.ask > 0 ? shortVolume(r.ask) : ""}</span>
              </button>
              <span className="dom-mine">{chips(r.sells)}</span>
            </div>
          );
        })}
      </div>
      <footer className="dom-foot">
        <span>{inReplay ? t("Replay: the recorded book at the replay time; trading from the ladder is off.") : t("Click a bid / ask cell to place a simulated limit (or stop past the spread); drag an order to move it.")}</span>
        {center !== null && (
          <button className="dom-btn" onClick={() => setCenter(null)}>
            {t("Center")}
          </button>
        )}
      </footer>
    </section>
  );
}
