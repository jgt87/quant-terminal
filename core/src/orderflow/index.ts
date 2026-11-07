// Order flow from individual trades: footprint bars (buy/sell volume per price level), bar delta,
// cumulative delta, imbalances and price binning. Pure functions shared by server and web.

/** One aggregated trade. `buy` is true when the aggressor (taker) bought. */
export interface FlowTrade {
  id: number;
  /** UTC milliseconds. */
  time: number;
  price: number;
  qty: number;
  buy: boolean;
}

export interface FootprintLevel {
  /** Lower edge of the price bin. */
  price: number;
  /** Volume bought by aggressors (lifting the offer). */
  buy: number;
  /** Volume sold by aggressors (hitting the bid). */
  sell: number;
}

export interface FootprintBar {
  /** Bar open time, UTC seconds. */
  time: number;
  /** Price levels, lowest first. */
  levels: FootprintLevel[];
  buy: number;
  sell: number;
  /** buy − sell. */
  delta: number;
  /** Lower edge of the level with the most volume (point of control). */
  poc: number;
  trades: number;
}

/** Buy / sell volume of one bar (from trades or from the exchange's taker-buy volume). */
export interface BarFlow {
  time: number;
  buy: number;
  sell: number;
}

const NICE = [1, 2, 2.5, 5, 10];

/** Smallest nice step (1 / 2 / 2.5 / 5 × 10^n) that is at least `raw`. */
export function niceFlowStep(raw: number): number {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = Math.pow(10, exp);
  for (const m of NICE) if (m * base >= raw * (1 - 1e-9)) return Number((m * base).toPrecision(12));
  return 10 * base;
}

/** Price bin (lower edge) of `price` for a bin size `tick`. */
export function binPrice(price: number, tick: number): number {
  return Number((Math.floor(price / tick + 1e-9) * tick).toPrecision(12));
}

/**
 * Footprint bin size: a nice step that splits the median bar range of `ranges` (high − low) into
 * about `levels` rows.
 */
export function footprintTick(ranges: readonly number[], levels = 12): number {
  const r = ranges.filter((x) => x > 0 && Number.isFinite(x)).sort((a, b) => a - b);
  if (!r.length) return 1;
  return niceFlowStep(r[Math.floor(r.length / 2)] / levels);
}

/**
 * Groups trades into footprint bars of `intervalSec` (bar time = trade time floored to the
 * interval) with price bins of `tick`. Bars come out in time order.
 */
export function buildFootprint(trades: readonly FlowTrade[], intervalSec: number, tick: number): FootprintBar[] {
  const bars = new Map<number, { levels: Map<number, FootprintLevel>; trades: number }>();
  for (const t of trades) {
    if (!(t.qty > 0) || !Number.isFinite(t.price)) continue;
    const time = Math.floor(t.time / 1000 / intervalSec) * intervalSec;
    let bar = bars.get(time);
    if (!bar) bars.set(time, (bar = { levels: new Map(), trades: 0 }));
    const p = binPrice(t.price, tick);
    let lv = bar.levels.get(p);
    if (!lv) bar.levels.set(p, (lv = { price: p, buy: 0, sell: 0 }));
    if (t.buy) lv.buy += t.qty;
    else lv.sell += t.qty;
    bar.trades++;
  }
  return [...bars.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([time, b]) => {
      const levels = [...b.levels.values()].sort((x, y) => x.price - y.price);
      let buy = 0;
      let sell = 0;
      let poc = levels[0]?.price ?? 0;
      let pocVol = -1;
      for (const l of levels) {
        buy += l.buy;
        sell += l.sell;
        if (l.buy + l.sell > pocVol) {
          pocVol = l.buy + l.sell;
          poc = l.price;
        }
      }
      return { time, levels, buy, sell, delta: buy - sell, poc, trades: b.trades };
    });
}

/**
 * Diagonal imbalances of a footprint bar (levels lowest first): a buy imbalance at level i when
 * buying there is at least `ratio` × the selling one level lower; a sell imbalance at level i when
 * selling there is at least `ratio` × the buying one level higher.
 */
export function imbalances(levels: readonly FootprintLevel[], ratio = 3): { buy: boolean[]; sell: boolean[] } {
  const buy = levels.map((l, i) => {
    const below = levels[i - 1]?.sell ?? 0;
    return l.buy > 0 && (below === 0 ? false : l.buy >= ratio * below);
  });
  const sell = levels.map((l, i) => {
    const above = levels[i + 1]?.buy ?? 0;
    return l.sell > 0 && (above === 0 ? false : l.sell >= ratio * above);
  });
  return { buy, sell };
}

/**
 * Delta (buy − sell) per chart bar, aligned to `times` (bar open times, UTC seconds); null where
 * there is no flow data for a bar.
 */
export function alignDelta(times: readonly number[], flow: readonly BarFlow[]): (number | null)[] {
  const by = new Map(flow.map((f) => [f.time, f.buy - f.sell]));
  return times.map((t) => by.get(t) ?? null);
}

/** Running total of a delta series; gaps keep the total and stay null. */
export function cumulativeDelta(delta: readonly (number | null)[]): (number | null)[] {
  let acc = 0;
  return delta.map((d) => {
    if (d == null) return null;
    acc += d;
    return acc;
  });
}
export * from "./detect";
