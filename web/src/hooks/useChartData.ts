// Loads the bar series for a chart into the engine (plain symbol, formula over several symbols,
// optional custom interval resampled from a provider interval), pages history in when the view
// nears the left edge, and polls the latest bars of every leg for live updates.

import { useEffect, useState } from "react";
import type { Interval, SymbolInfo } from "@qt/core";
import { ApiError, isAbort } from "../api/client";
import { barPoller } from "../api/liveFeed";
import type { ChartEngine } from "../chart/ChartEngine";
import settings from "../config/settings.json";
import { SeriesSource, type BarOptions } from "../data/seriesSource";

export type DataStatus = "loading" | "ready" | "empty" | "error";

export interface ChartDataState {
  status: DataStatus;
  info: SymbolInfo | null;
  loadingHistory: boolean;
  hasMore: boolean;
  /** Bumps on every live update so consumers can refresh derived values. */
  tick: number;
  /** The series is one provider series as is (live ticks can fold into its last bar). */
  plain: boolean;
  /** Provider interval the bars are fetched in. */
  provider: Interval | null;
}

const INITIAL: ChartDataState = { status: "loading", info: null, loadingHistory: false, hasMore: true, tick: 0, plain: true, provider: null };

/** Bar times of the loaded series on the chart root (`data-bar-times`: newest 6000, `data-first-time`) for tools and tests. */
function markTimes(engine: ChartEngine): void {
  engine.root.dataset.barTimes = engine.raw.times.slice(-6000).join(",");
  engine.root.dataset.firstTime = String(engine.raw.times[0] ?? "");
}

export function useChartData(
  engine: ChartEngine | null,
  symbol: string,
  interval: Interval,
  customInterval?: string,
  opts: BarOptions = {},
): ChartDataState {
  const [state, setState] = useState<ChartDataState>(INITIAL);
  const adjust = opts.adjust;
  const session = opts.session;

  useEffect(() => {
    if (!engine) return;
    // One controller per series: switching aborts every request of the old series.
    const ctrl = new AbortController();
    const signal = ctrl.signal;
    let src: SeriesSource;
    try {
      src = new SeriesSource({ symbol, interval, customInterval, opts: { adjust, session } }, settings.barsPageSize);
    } catch (e) {
      engine.clearData(e instanceof Error ? e.message : "Invalid formula");
      setState({ ...INITIAL, status: "error" });
      return;
    }
    const intervalSec = src.seconds;
    const intraday = intervalSec < 86400;
    const plain = !src.isFormula && !src.isResampled;
    let hasMore = true;
    let ready = false;
    let loadingHistory = false;
    // A new symbol must not be drawn over the previous symbol's bars while loading.
    if (engine.meta.symbol !== symbol) engine.clearData(null);
    const stops: (() => void)[] = [];
    let retryTimer: number | undefined;
    setState((s) => ({ ...INITIAL, plain, provider: src.provider, info: s.info?.symbol === symbol ? s.info : null }));

    // One shared polling loop for every chart on screen (identical keys are fetched once).
    const poll = () => {
      for (const leg of src.plan.legs) {
        stops.push(
          barPoller.subscribe(
            leg,
            src.provider,
            (bars) => {
              if (signal.aborted) return;
              for (const b of src.live(leg, bars)) engine.upsertBar(b);
              setState((s) => ({ ...s, tick: s.tick + 1 }));
            },
            { adjust, session },
          ),
        );
      }
    };

    src
      .load(signal)
      .then((res) => {
        // Cancellation can happen after the provider settles but before this callback runs.
        if (signal.aborted) return;
        hasMore = res.hasMore;
        if (res.bars.length === 0) {
          engine.clearData("No data");
          setState((s) => ({ ...s, status: "empty", info: res.info, hasMore }));
          return;
        }
        engine.setData(res.bars, { symbol, interval, intervalSec, intraday, fx: res.info.type === "fx" });
        markTimes(engine);
        ready = true;
        setState((s) => ({ ...s, status: "ready", info: res.info, hasMore }));
        poll();
      })
      .catch((e) => {
        if (signal.aborted || isAbort(e)) return;
        const notFound = e instanceof ApiError && (e.status === 404 || e.code === "not_found");
        engine.clearData(notFound ? "Symbol not found" : e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Data unavailable");
        setState((s) => ({ ...s, status: "error", info: null }));
      });

    const off = engine.events.on("needHistory", () => {
      // Requests raised by the previous series (before this one loaded) are ignored;
      // setData() re-arms the engine's history trigger.
      if (!ready || !hasMore || loadingHistory || signal.aborted) return;
      loadingHistory = true;
      setState((s) => ({ ...s, loadingHistory: true }));
      const before = src.bars().length;
      src
        .older(signal)
        .then((res) => {
          if (signal.aborted) return;
          const added = res.bars.length - before;
          // Plain series prepend; resampled/formula series are recomposed (the first, partial
          // bucket can complete) and replaced without moving the view.
          if (plain) engine.prependBars(res.bars.slice(0, Math.max(0, added)));
          else engine.setData(res.bars, { symbol, interval, intervalSec, intraday, fx: engine.meta.fx });
          markTimes(engine);
          hasMore = res.hasMore && added > 0;
          if (added <= 0) engine.historyDone();
        })
        .catch((e) => {
          if (signal.aborted || isAbort(e)) return;
          retryTimer = window.setTimeout(() => {
            if (!signal.aborted) engine.historyDone();
          }, 5000);
        })
        .finally(() => {
          loadingHistory = false;
          if (!signal.aborted) setState((s) => ({ ...s, loadingHistory: false, hasMore }));
        });
    });

    return () => {
      ctrl.abort();
      off();
      stops.forEach((s) => s());
      window.clearTimeout(retryTimer);
    };
  }, [engine, symbol, interval, customInterval, adjust, session]);

  return state;
}
