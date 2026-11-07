// Order flow signals, rule based and documented here:
//
// - Absorption: heavy aggressive volume at a bar's extreme that does not move price through it.
//   At the low: aggressive sell volume in the lowest two price bins is at least `factor` (2.5) times the
//   average bin volume of the recent bars, and the bar closes in its upper 60 % (passive buyers
//   absorbed the selling: "absorption at bid"). Mirrored at the high ("absorption at ask").
// - Stop run: a bar trades beyond the highest high (lowest low) of the previous `lookback` bars,
//   aggressive volume beyond that level is at least `runShare` (0.3) of the average bar volume, and the
//   bar closes back inside the old range (the run through resting stops reversed).
// - Iceberg: a price level that keeps showing size while trades at it add up to at least
//   `factor` times the most it ever showed (hidden size refilled it). Tracked live from the order
//   book and the trade stream.

import type { Bar } from "../types";
import type { FlowTrade, FootprintBar } from "./index";

export type FlowEventKind = "absorption-bid" | "absorption-ask" | "stop-run-up" | "stop-run-down" | "iceberg-bid" | "iceberg-ask";

export const FLOW_EVENT_KINDS: readonly FlowEventKind[] = ["absorption-bid", "absorption-ask", "stop-run-up", "stop-run-down", "iceberg-bid", "iceberg-ask"];

export const FLOW_EVENT_LABEL: Record<FlowEventKind, string> = {
  "absorption-bid": "Absorption at bid",
  "absorption-ask": "Absorption at ask",
  "stop-run-up": "Stop run up",
  "stop-run-down": "Stop run down",
  "iceberg-bid": "Iceberg bid",
  "iceberg-ask": "Iceberg ask",
};

export interface FlowEvent {
  kind: FlowEventKind;
  /** UTC seconds: the bar open time for bar signals, the trade time for icebergs. */
  time: number;
  price: number;
  /** Volume behind the signal (absorbed, run or executed against the iceberg). */
  size: number;
}

export interface DetectOptions {
  /** Absorption: bin volume vs the average bin volume. */
  factor?: number;
  /** Bars looked back for averages and for the prior high / low. */
  lookback?: number;
  /** Stop run: volume beyond the old extreme vs the average bar volume. */
  runShare?: number;
}

const barVolume = (b: FootprintBar) => b.buy + b.sell;

/**
 * Absorption and stop-run signals of footprint bars. `bars` supplies open / high / low / close
 * by time (bars without one are skipped). Each signal looks only at its own bar and the bars
 * before it.
 */
export function detectFlowEvents(prints: readonly FootprintBar[], bars: readonly Bar[], tick: number, opts: DetectOptions = {}): FlowEvent[] {
  const factor = opts.factor ?? 2.5;
  const lookback = opts.lookback ?? 20;
  const runShare = opts.runShare ?? 0.3;
  const byTime = new Map(bars.map((b) => [b.time, b]));
  const sorted = [...prints].sort((a, b) => a.time - b.time);
  const out: FlowEvent[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const fp = sorted[i];
    const bar = byTime.get(fp.time);
    if (!bar || !fp.levels.length) continue;
    const prev = sorted.slice(Math.max(0, i - lookback), i);
    // Averages over the previous bars (the bar itself included when there is no history).
    const ref = prev.length ? prev : [fp];
    let binSum = 0;
    let bins = 0;
    for (const p of ref) for (const l of p.levels) (binSum += l.buy + l.sell), bins++;
    const avgBin = bins ? binSum / bins : 0;
    const avgBar = ref.reduce((s, p) => s + barVolume(p), 0) / ref.length;
    const range = bar.high - bar.low;
    if (avgBin > 0 && range > 0) {
      const low = fp.levels.slice(0, 2);
      const high = fp.levels.slice(-2);
      const sellLow = low.reduce((s, l) => s + l.sell, 0);
      const buyHigh = high.reduce((s, l) => s + l.buy, 0);
      if (sellLow >= factor * avgBin * low.length && bar.close >= bar.low + 0.4 * range) out.push({ kind: "absorption-bid", time: fp.time, price: low[0].price, size: sellLow });
      if (buyHigh >= factor * avgBin * high.length && bar.close <= bar.high - 0.4 * range) out.push({ kind: "absorption-ask", time: fp.time, price: high[high.length - 1].price + tick, size: buyHigh });
    }
    // Stop runs need the prior bars' range.
    const prior = bars.filter((b) => b.time < fp.time).slice(-lookback);
    if (prior.length < Math.min(lookback, 5) || !(avgBar > 0)) continue;
    const priorHigh = Math.max(...prior.map((b) => b.high));
    const priorLow = Math.min(...prior.map((b) => b.low));
    if (bar.high > priorHigh && bar.close < priorHigh) {
      const beyond = fp.levels.filter((l) => l.price + tick > priorHigh).reduce((s, l) => s + l.buy, 0);
      if (beyond >= runShare * avgBar) out.push({ kind: "stop-run-up", time: fp.time, price: bar.high, size: beyond });
    }
    if (bar.low < priorLow && bar.close > priorLow) {
      const beyond = fp.levels.filter((l) => l.price < priorLow).reduce((s, l) => s + l.sell, 0);
      if (beyond >= runShare * avgBar) out.push({ kind: "stop-run-down", time: fp.time, price: bar.low, size: beyond });
    }
  }
  return out;
}

/**
 * Live iceberg detection: feed it every book level change and every trade. A level that has
 * traded at least `factor` × the largest size it showed (and at least `minSize`) while still
 * showing size produces one event, then starts counting again.
 */
export class IcebergTracker {
  /** side|price → largest size shown and volume traded at it since it appeared. */
  private readonly levels = new Map<string, { shown: number; current: number; traded: number }>();

  constructor(
    private readonly factor = 3,
    /** Smallest traded volume that counts (filters out tiny levels); can change while running. */
    public minSize = 0,
    private readonly maxLevels = 20000,
  ) {}

  private key = (side: "bid" | "ask", price: number) => `${side}|${price}`;

  /** A book level changed (size 0 = removed). */
  level(side: "bid" | "ask", price: number, qty: number): void {
    const k = this.key(side, price);
    if (!(qty > 0)) {
      this.levels.delete(k);
      return;
    }
    const l = this.levels.get(k);
    if (l) (l.shown = Math.max(l.shown, qty)), (l.current = qty);
    else {
      this.levels.set(k, { shown: qty, current: qty, traded: 0 });
      if (this.levels.size > this.maxLevels) this.levels.delete(this.levels.keys().next().value as string);
    }
  }

  /** Forget everything (book reloaded). */
  reset(): void {
    this.levels.clear();
  }

  /**
   * A trade. An aggressive buy executes against the ask at its price, a sell against the bid.
   * Returns an event when the level qualifies.
   */
  trade(t: FlowTrade): FlowEvent | null {
    const side = t.buy ? "ask" : "bid";
    const l = this.levels.get(this.key(side, t.price));
    if (!l) return null;
    l.traded += t.qty;
    if (l.current > 0 && l.traded >= this.factor * l.shown && l.traded >= this.minSize) {
      const ev: FlowEvent = { kind: side === "ask" ? "iceberg-ask" : "iceberg-bid", time: Math.floor(t.time / 1000), price: t.price, size: l.traded };
      l.traded = 0;
      return ev;
    }
    return null;
  }
}

/** Number of events of `kind` per bar open time, for bars of `intervalSec` (UTC seconds). */
export function eventsPerBar(events: readonly FlowEvent[], kind: FlowEventKind, barTimes: readonly number[]): Map<number, number> {
  const out = new Map<number, number>();
  if (!barTimes.length) return out;
  for (const e of events) {
    if (e.kind !== kind) continue;
    // The bar containing the event: the last bar opening at or before it.
    let lo = 0;
    let hi = barTimes.length - 1;
    if (e.time < barTimes[0]) continue;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (barTimes[mid] <= e.time) lo = mid;
      else hi = mid - 1;
    }
    out.set(barTimes[lo], (out.get(barTimes[lo]) ?? 0) + 1);
  }
  return out;
}
