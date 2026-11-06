// Bar Replay controls at the bottom of a chart: pick hint, play/pause, step, speed, jump to real
// time, exit, plus a paper-trading ticket that fills at the current replay bar's close. The paper
// account lives only in this component (one replay session) and never reaches the server.

import { useEffect, useMemo, useState } from "react";
import type { ChartEngine } from "../../chart/ChartEngine";
import { formatPrice } from "../../chart/format";
import type { TradeMarker } from "../../chart/renderers/overlays";
import { REPLAY_SPEEDS, atEnd, type ReplayState } from "../../chart/replay";
import { EMPTY_ACCOUNT, placeOrder, totalPnl, unrealized, type ReplayAccount, type ReplayOrder } from "../../chart/replayPaper";
import costs from "../../config/backtestDefaults.json";
import { Icon } from "../icons";
import { ReplayTrades } from "./ReplayTrades";
import "../../styles/replay.css";

interface Props {
  engine: ChartEngine;
  state: ReplayState;
}

/** Buttons never take focus, so Space keeps driving the chart. */
const noFocus = (e: React.MouseEvent) => e.preventDefault();

export function ReplayBar({ engine, state }: Props) {
  const [acc, setAcc] = useState<ReplayAccount>(EMPTY_ACCOUNT);
  const [qty, setQty] = useState<number>(costs.sizingQty);
  const [showTrades, setShowTrades] = useState(false);
  const times = engine.replayTimes();
  const price = engine.replayPrice();
  const decimals = engine.mainPane.ps.formatDecimals(price?.close ?? 1);
  const fmt = (v: number) => formatPrice(v, decimals);

  // Fills are drawn on the chart like backtest trades.
  const markers = useMemo<TradeMarker[]>(
    () => acc.fills.map((f) => ({ time: f.time, price: f.price, kind: f.side === "buy" ? "entry-long" : "entry-short" })),
    [acc.fills],
  );
  useEffect(() => engine.setReplayMarkers(markers), [engine, markers]);
  useEffect(() => () => engine.setReplayMarkers([]), [engine]);

  const act = (a: Parameters<ChartEngine["replayDispatch"]>[0]) => {
    engine.replayDispatch(a);
    engine.focus();
  };
  const order = (o: ReplayOrder) => {
    const p = engine.replayPrice();
    if (p) setAcc((a) => placeOrder(a, o, p.close, p.time, costs));
    engine.focus();
  };

  if (state.phase === "select") {
    return (
      <div className="replay-bar" role="toolbar" aria-label="Bar replay" data-replay="select">
        <span className="replay-hint">Bar replay: click the chart to choose the start bar</span>
        <span className="spacer" />
        <button className="replay-btn" onMouseDown={noFocus} onClick={() => act({ type: "exit" })} aria-label="Exit replay" title="Exit replay (Esc)">
          <Icon name="close" size={14} />
        </button>
      </div>
    );
  }

  const last = price?.close ?? 0;
  const pnl = totalPnl(acc, last);
  const open = unrealized(acc, last);
  const ended = atEnd(state, times);
  const pos = acc.qty === 0 ? "Flat" : `${acc.qty > 0 ? "Long" : "Short"} ${Math.abs(acc.qty)} @ ${fmt(acc.avgPrice)}`;

  return (
    <div className="replay-wrap">
      {showTrades && <ReplayTrades fills={acc.fills} format={fmt} />}
      <div className="replay-bar" role="toolbar" aria-label="Bar replay" data-replay="on" data-cursor={state.cursor ?? ""}>
        <button
          className="replay-btn"
          onMouseDown={noFocus}
          onClick={() => act({ type: "toggle", times })}
          disabled={ended && !state.playing}
          aria-label={state.playing ? "Pause" : "Play"}
          title={state.playing ? "Pause (Space)" : "Play (Space)"}
        >
          <Icon name={state.playing ? "pause" : "play"} size={14} />
        </button>
        <button className="replay-btn" onMouseDown={noFocus} onClick={() => act({ type: "step", times })} disabled={ended} aria-label="Step forward" title="Step forward (Shift+Right)">
          <Icon name="stepForward" size={14} />
        </button>
        <select
          className="replay-speed"
          aria-label="Replay speed"
          value={state.speed}
          onChange={(e) => act({ type: "speed", value: Number(e.target.value) })}
          title="Bars per second"
        >
          {REPLAY_SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
        {engine.tickSource && (
          <label className="replay-ticks" title="Build each bar from its recorded ticks while playing (Binance trades, MT5 ticks)">
            <input type="checkbox" checked={Boolean(state.ticks)} onChange={(e) => act({ type: "ticks", on: e.target.checked })} />
            Ticks
          </label>
        )}
        {state.ticks && engine.tickNote && <span className="replay-note">{engine.tickNote}</span>}
        <button className="replay-btn text" onMouseDown={noFocus} onClick={() => act({ type: "realtime", times })} disabled={ended} title="Reveal every bar">
          Jump to real time
        </button>
        <span className="replay-sep" />
        <label className="replay-qty">
          <span>Qty</span>
          <input type="number" min={0} step="any" value={qty} aria-label="Order quantity" onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))} />
        </label>
        <button className="replay-btn buy" onMouseDown={noFocus} onClick={() => order({ side: "buy", qty })} aria-label="Buy" disabled={!price}>
          Buy
        </button>
        <button className="replay-btn sell" onMouseDown={noFocus} onClick={() => order({ side: "sell", qty })} aria-label="Sell" disabled={!price}>
          Sell
        </button>
        <button className="replay-btn text" onMouseDown={noFocus} onClick={() => order({ side: "flat" })} aria-label="Flat" disabled={acc.qty === 0}>
          Flat
        </button>
        <span className="replay-pos" data-testid="replay-position">
          {pos}
        </span>
        <span className={`replay-pnl ${pnl >= 0 ? "pos" : "neg"}`} data-testid="replay-pnl" title={`Open ${fmt(open)} · realized ${fmt(acc.realized)} · fees ${fmt(acc.fees)}`}>
          P&amp;L {pnl >= 0 ? "+" : ""}
          {fmt(pnl)}
        </span>
        <button className={`replay-btn text${showTrades ? " active" : ""}`} onMouseDown={noFocus} onClick={() => setShowTrades((v) => !v)} aria-pressed={showTrades}>
          Trades ({acc.fills.length})
        </button>
        <span className="spacer" />
        <button className="replay-btn" onMouseDown={noFocus} onClick={() => act({ type: "exit" })} aria-label="Exit replay" title="Exit replay">
          <Icon name="close" size={14} />
        </button>
      </div>
    </div>
  );
}
