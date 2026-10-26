// Secondary series of a chart: compare symbols, higher-timeframe bars for multi-timeframe
// indicators, and corporate events. Each loads through the same series loader as the main chart
// (formulas and custom intervals work for compare symbols too) and follows live updates.

import { useEffect, useMemo } from "react";
import { isExpression, type Bar, type Interval } from "@qt/core";
import { getEvents, isAbort } from "../api/client";
import { barPoller } from "../api/liveFeed";
import type { ChartEngine } from "../chart/ChartEngine";
import settings from "../config/settings.json";
import { legsToPage } from "../data/comparePaging";
import { SeriesSource, type BarOptions } from "../data/seriesSource";

/** Loads a series and keeps it live; calls `onBars` with the full series after every change. */
function follow(
  src: SeriesSource,
  signal: AbortSignal,
  onBars: (bars: Bar[]) => void,
  onError: (msg: string) => void,
  onLoaded?: () => void,
): () => void {
  const stops: (() => void)[] = [];
  src
    .load(signal)
    .then((r) => {
      if (signal.aborted) return;
      onBars(r.bars);
      onLoaded?.();
      for (const leg of src.plan.legs) {
        stops.push(
          barPoller.subscribe(
            leg,
            src.provider,
            (bars) => {
              if (signal.aborted) return;
              src.live(leg, bars);
              onBars(src.bars());
            },
            src.spec.opts,
          ),
        );
      }
    })
    .catch((e) => {
      if (!isAbort(e)) onError(e instanceof Error ? e.message : "Data unavailable");
    });
  return () => stops.forEach((s) => s());
}

/** Compare symbols as percent overlays (colors from the chart theme palette). */
export function useCompareSeries(
  engine: ChartEngine | null,
  symbols: readonly string[] | undefined,
  interval: Interval,
  customInterval: string | undefined,
  opts: BarOptions,
  palette: readonly string[],
): void {
  const key = (symbols ?? []).join("\n");
  const pal = palette.join(",");
  const adjust = opts.adjust;
  const session = opts.session;
  useEffect(() => {
    if (!engine) return;
    const list = key ? key.split("\n") : [];
    const colors = pal.split(",");
    const state = list.map((symbol, i) => ({ symbol, color: colors[i % colors.length], bars: [] as readonly Bar[], error: undefined as string | undefined }));
    engine.setCompare(state);
    if (!list.length) return;
    const ctrl = new AbortController();
    const push = () => engine.setCompare(state.map((s) => ({ ...s })));
    const srcs = list.map((symbol) => new SeriesSource({ symbol, interval, customInterval, opts: { adjust, session } }, settings.barsPageSize));
    const loaded = list.map(() => false);
    const busy = list.map(() => false);
    // History paging: when the main series reaches further back than a compare leg, page that
    // leg's older bars in (one page at a time) until it covers the main series' first bar.
    const cover = () => {
      const mainFirst = engine.raw.bars[0]?.time;
      if (mainFirst == null || ctrl.signal.aborted) return;
      const legs = srcs.map((src, i) => ({ loaded: loaded[i], busy: busy[i], hasMore: src.hasMore(), first: src.bars()[0]?.time ?? null }));
      // Coverage on the chart root (`data-compare-first` / `data-compare-more` per leg) for tools and tests.
      engine.root.dataset.compareFirst = legs.map((l) => l.first ?? "").join(",");
      engine.root.dataset.compareMore = legs.map((l) => l.hasMore).join(",");
      for (const i of legsToPage(mainFirst, legs)) {
        const src = srcs[i];
        busy[i] = true;
        src
          .older(ctrl.signal)
          .then((r) => {
            if (ctrl.signal.aborted) return;
            state[i].bars = r.bars;
            push();
          })
          .catch(() => {
            /* transient: the next main page retries */
          })
          .finally(() => {
            busy[i] = false;
            if (!ctrl.signal.aborted) queueMicrotask(cover);
          });
      }
    };
    const stops = srcs.map((src, i) =>
      follow(
        src,
        ctrl.signal,
        (bars) => {
          state[i].bars = bars;
          state[i].error = undefined;
          push();
        },
        (msg) => {
          state[i].error = msg;
          push();
        },
        () => {
          loaded[i] = true;
          cover();
        },
      ),
    );
    const offData = engine.events.on("data", cover);
    return () => {
      ctrl.abort();
      offData();
      delete engine.root.dataset.compareFirst;
      delete engine.root.dataset.compareMore;
      stops.forEach((s) => s());
    };
  }, [engine, key, interval, customInterval, adjust, session, pal]);
}

/** Bars of every higher timeframe the indicators ask for. */
export function useTimeframeBars(engine: ChartEngine | null, symbol: string, timeframes: readonly string[], opts: BarOptions): void {
  const key = useMemo(() => [...new Set(timeframes)].sort().join(","), [timeframes]);
  const adjust = opts.adjust;
  const session = opts.session;
  useEffect(() => {
    if (!engine || !key) return;
    const ctrl = new AbortController();
    const tfs = key.split(",");
    const stops = tfs.map((tf) => {
      const src = new SeriesSource({ symbol, interval: tf as Interval, opts: { adjust, session } }, settings.barsPageSize);
      return follow(
        src,
        ctrl.signal,
        (bars) => engine.setTimeframeBars(tf, bars),
        () => engine.setTimeframeBars(tf, []),
      );
    });
    return () => {
      ctrl.abort();
      stops.forEach((s) => s());
      for (const tf of tfs) engine.setTimeframeBars(tf, null);
    };
  }, [engine, symbol, key, adjust, session]);
}

/** Dividends, splits and earnings of a plain symbol (formulas have none). */
export function useCorporateEvents(engine: ChartEngine | null, symbol: string): void {
  useEffect(() => {
    if (!engine) return;
    engine.setEvents([]);
    if (!symbol || isExpression(symbol)) return;
    const ctrl = new AbortController();
    getEvents(symbol, ctrl.signal)
      .then((ev) => !ctrl.signal.aborted && engine.setEvents(Array.isArray(ev) ? ev : []))
      .catch(() => {
        /* events are optional decoration */
      });
    return () => ctrl.abort();
  }, [engine, symbol]);
}
