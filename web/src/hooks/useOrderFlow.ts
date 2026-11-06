// Loads crypto order flow for a chart (Binance symbols only) and keeps it current: taker
// buy/sell volume per bar for the Delta / CVD panes, and footprint bars of the most recent bars
// for footprint cells and volume bubbles. Everything is fetched in the provider interval; the
// engine groups it into the displayed bars.

import { useEffect, useRef } from "react";
import { footprintTick, INTERVAL_SECONDS, type BarFlow, type ChartSettings, type FootprintBar, type Interval } from "@qt/core";
import { fetchFlow, fetchFootprint } from "../api/orderflow";
import type { ChartEngine } from "../chart/ChartEngine";

type Flags = NonNullable<ChartSettings["orderFlow"]>;

const FLOW_MAX_BARS = 5000;
const FOOTPRINT_BARS = 60;
const FOOTPRINT_INTERVALS = new Set<Interval>(["1m", "5m", "15m", "30m", "1h", "4h", "1D"]);
const LIVE_MS = 5000;

/** Merges bars by time (newer lists win). */
function mergeByTime<T extends { time: number }>(old: readonly T[], add: readonly T[]): T[] {
  const m = new Map(old.map((b) => [b.time, b]));
  for (const b of add) m.set(b.time, b);
  return [...m.values()].sort((a, b) => a.time - b.time);
}

/**
 * Footprints of the bars from `firstBar` to `lastBar`, walked forward in requests: the server
 * returns the bars it could cover fully and where to continue. When the trades are too many for
 * the request budget the window shrinks toward the newest bars.
 */
async function loadFootprints(symbol: string, interval: Interval, sec: number, lastBar: number, tick: number, alive: () => boolean): Promise<FootprintBar[]> {
  let count = FOOTPRINT_BARS;
  for (let attempt = 0; attempt < 3 && alive(); attempt++) {
    let t = lastBar - (count - 1) * sec;
    const got: FootprintBar[] = [];
    for (let req = 0; req < 8 && alive(); req++) {
      const r = await fetchFootprint(symbol, interval, t, lastBar + sec, tick);
      got.push(...r.bars);
      if (r.complete) return got;
      if (r.next === undefined || r.next <= t) break;
      t = r.next;
    }
    if (got.length && got[got.length - 1].time >= lastBar - sec) return got;
    count = Math.max(2, Math.floor(count / 4));
  }
  return [];
}

export function useOrderFlow(engine: ChartEngine | null, symbol: string, interval: Interval, flags: Flags | undefined, provider: string | undefined, ready: boolean, transformed: boolean): void {
  const wantFlow = Boolean(flags?.delta || flags?.cvd);
  const wantPrint = Boolean(flags?.footprint || flags?.bubbles) && FOOTPRINT_INTERVALS.has(interval);
  const on = Boolean(engine) && ready && provider === "binance" && !transformed && (wantFlow || wantPrint);
  const state = useRef<{ flow: BarFlow[]; prints: FootprintBar[]; tick: number }>({ flow: [], prints: [], tick: 0 });

  useEffect(() => {
    if (!engine) return;
    if (!on) {
      engine.setOrderFlow(null);
      return;
    }
    let alive = true;
    const isAlive = () => alive;
    const sec = INTERVAL_SECONDS[interval];
    const st: { flow: BarFlow[]; prints: FootprintBar[]; tick: number } = { flow: [], prints: [], tick: 0 };
    state.current = st;
    const push = () => alive && engine.setOrderFlow({ flow: st.flow, footprints: st.prints, tick: st.tick });
    const bars = () => engine.raw.bars;
    let flowFrom = Infinity;

    const loadFlow = async (from: number, to: number) => {
      const r = await fetchFlow(symbol, interval, from, to);
      if (!alive) return;
      st.flow = mergeByTime(st.flow, r.flow);
      push();
    };

    const init = async () => {
      const b = bars();
      if (!b.length) return;
      const last = b[b.length - 1].time;
      if (wantPrint) {
        st.tick = footprintTick(b.slice(-100).map((x) => x.high - x.low));
      }
      const jobs: Promise<unknown>[] = [];
      if (wantFlow) {
        flowFrom = Math.max(b[0].time, last - (FLOW_MAX_BARS - 1) * sec);
        jobs.push(loadFlow(flowFrom, last + sec));
      }
      if (wantPrint) {
        jobs.push(
          loadFootprints(symbol, interval, sec, last, st.tick, isAlive).then((p) => {
            if (!alive) return;
            st.prints = mergeByTime(st.prints, p);
            push();
          }),
        );
      }
      push();
      await Promise.allSettled(jobs);
    };

    // Live: the newest two bars every few seconds; older history when the chart pages back.
    const tick = async () => {
      const b = bars();
      if (!b.length) return;
      const last = b[b.length - 1].time;
      const jobs: Promise<unknown>[] = [];
      if (wantFlow) {
        jobs.push(loadFlow(last - sec, last + sec));
        const first = Math.max(b[0].time, last - (FLOW_MAX_BARS - 1) * sec);
        if (first < flowFrom) {
          jobs.push(loadFlow(first, flowFrom));
          flowFrom = first;
        }
      }
      if (wantPrint && st.tick > 0) {
        jobs.push(
          fetchFootprint(symbol, interval, last - sec, last + sec, st.tick).then((r) => {
            if (!alive) return;
            st.prints = mergeByTime(st.prints, r.bars);
            push();
          }),
        );
      }
      await Promise.allSettled(jobs);
    };

    void init().catch(() => {
      /* order flow is optional: the chart keeps working without it */
    });
    const timer = window.setInterval(() => void tick().catch(() => {}), LIVE_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [engine, on, symbol, interval, wantFlow, wantPrint]);
}
