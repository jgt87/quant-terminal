// Loads one chart series: a plain symbol, a formula over several symbols, and/or a custom
// interval resampled from a provider interval. Keeps each leg's provider bars so history pages
// and live updates recompose the whole series consistently.

import { INTERVAL_SECONDS, type Bar, type Interval, type SymbolInfo } from "@qt/core";
import { getBars } from "../api/client";
import { composeSeries, mergeBars, planSeries, prependBars, type SeriesPlan } from "./compose";
import { parseIntervalSpec, providerIntervalFor, providerPageLimit } from "./intervalSpec";
import { bucketAnchorFor, UTC_ANCHOR, type BucketAnchor } from "./sessions";

export interface BarOptions {
  adjust?: "dividends";
  session?: "extended";
}

export interface SeriesSpec {
  symbol: string;
  /** Provider interval when no custom interval is set. */
  interval: Interval;
  customInterval?: string;
  opts?: BarOptions;
}

export interface LoadResult {
  bars: Bar[];
  info: SymbolInfo;
  hasMore: boolean;
}

/** Resolved fetch plan of a spec: provider interval, seconds and page size. */
export function resolveSpec(spec: SeriesSpec, pageSize: number): { provider: Interval; seconds: number; limit: number; plan: SeriesPlan } {
  const custom = spec.customInterval ? parseIntervalSpec(spec.customInterval) : null;
  const provider = (custom && providerIntervalFor(custom)) || spec.interval;
  const seconds = custom && providerIntervalFor(custom) ? custom.seconds : INTERVAL_SECONDS[spec.interval];
  const limit = custom && seconds !== INTERVAL_SECONDS[provider] ? providerPageLimit(custom, provider, pageSize) : pageSize;
  return { provider, seconds, limit, plan: planSeries(spec.symbol, INTERVAL_SECONDS[provider], seconds) };
}

export class SeriesSource {
  readonly provider: Interval;
  readonly seconds: number;
  readonly plan: SeriesPlan;
  private readonly limit: number;
  private legs: Record<string, Bar[]> = {};
  private more: Record<string, boolean> = {};
  private cache: Bar[] = [];

  constructor(
    readonly spec: SeriesSpec,
    pageSize: number,
  ) {
    const r = resolveSpec(spec, pageSize);
    this.provider = r.provider;
    this.seconds = r.seconds;
    this.limit = r.limit;
    this.plan = r.plan;
  }

  get isFormula(): boolean {
    return this.plan.expr !== null;
  }

  get isResampled(): boolean {
    return this.plan.fromSec !== this.plan.toSec;
  }

  /** Current composed series. */
  bars(): Bar[] {
    return this.cache;
  }

  private recompose(): Bar[] {
    this.cache = composeSeries(this.plan, this.legs);
    return this.cache;
  }

  async load(signal: AbortSignal): Promise<LoadResult> {
    const res = await Promise.all(
      this.plan.legs.map((s) => getBars({ symbol: s, interval: this.provider, limit: this.limit, ...this.spec.opts }, signal)),
    );
    res.forEach((r, i) => {
      this.legs[this.plan.legs[i]] = r.bars;
      this.more[this.plan.legs[i]] = r.hasMore;
    });
    if (this.isResampled) this.plan.anchor = commonAnchor(res.map((r) => bucketAnchorFor(r.symbol, this.plan.fromSec, this.plan.toSec)));
    const first = res[0].symbol;
    const info: SymbolInfo = this.isFormula
      ? { symbol: this.spec.symbol, name: `Formula of ${this.plan.legs.join(", ")}`, exchange: "Formula", type: "other", currency: first.currency, provider: first.provider }
      : first;
    return { bars: this.recompose(), info, hasMore: this.hasMore() };
  }

  hasMore(): boolean {
    return this.plan.legs.every((s) => this.more[s]);
  }

  /** Fetches one older page of every leg; returns the full recomposed series. */
  async older(signal: AbortSignal): Promise<{ bars: Bar[]; hasMore: boolean }> {
    const legs = this.plan.legs.filter((s) => this.more[s] && this.legs[s]?.length);
    const res = await Promise.all(
      legs.map((s) => getBars({ symbol: s, interval: this.provider, to: this.legs[s][0].time, limit: this.limit, ...this.spec.opts }, signal)),
    );
    res.forEach((r, i) => {
      const s = legs[i];
      const before = this.legs[s].length;
      this.legs[s] = prependBars(this.legs[s], r.bars);
      this.more[s] = r.hasMore && this.legs[s].length > before;
    });
    return { bars: this.recompose(), hasMore: this.hasMore() };
  }

  /** Live bars of one leg: merged in; returns the last composed bars to upsert. */
  live(leg: string, fresh: readonly Bar[], tail = 2): Bar[] {
    if (!this.legs[leg]) return [];
    this.legs[leg] = mergeBars(this.legs[leg], fresh);
    const all = this.recompose();
    return all.slice(-tail);
  }
}

/** The legs' shared bucket anchor; legs that disagree (mixed markets) fall back to UTC. */
export function commonAnchor(list: readonly BucketAnchor[]): BucketAnchor {
  const first = list[0] ?? UTC_ANCHOR;
  const key = JSON.stringify(first);
  return list.every((a) => JSON.stringify(a) === key) ? first : UTC_ANCHOR;
}
