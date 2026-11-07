// Option chains: types and pure helpers shared by server and web (strike rows per expiry,
// at-the-money strike, volatility smile and term structure).

export interface OptionQuote {
  /** Exchange symbol, e.g. BTC-261225-85000-C. */
  symbol: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  /** Contracts traded in the last 24 h. */
  volume: number;
  openInterest: number | null;
  mark: number | null;
  /** Implied volatility of the mark price (0.45 = 45 %). */
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

export interface OptionRow {
  strike: number;
  call: OptionQuote | null;
  put: OptionQuote | null;
}

export interface OptionExpiry {
  /** Expiry time, UTC ms. */
  time: number;
  /** Exchange code, e.g. 261225 (YYMMDD). */
  code: string;
}

export interface OptionChain {
  /** App symbol of the underlying, e.g. BINANCE:BTCUSDT. */
  symbol: string;
  underlying: string;
  /** Index (spot reference) price of the underlying. */
  index: number | null;
  expiries: OptionExpiry[];
  /** The expiry the rows belong to. */
  expiry: OptionExpiry | null;
  rows: OptionRow[];
  /** At-the-money implied volatility per expiry (term structure), when known. */
  term: { time: number; iv: number }[];
  time: number;
}

/** Parses an exchange option symbol "BASE-YYMMDD-STRIKE-C|P". */
export function parseOptionSymbol(s: string): { base: string; code: string; strike: number; side: "call" | "put" } | null {
  const m = /^([A-Z0-9]+)-(\d{6})-(\d+(?:\.\d+)?)-([CP])$/.exec(s);
  if (!m) return null;
  return { base: m[1], code: m[2], strike: Number(m[3]), side: m[4] === "C" ? "call" : "put" };
}

/** Rows by strike, ascending, from quotes of one expiry. */
export function chainRows(quotes: readonly OptionQuote[]): OptionRow[] {
  const rows = new Map<number, OptionRow>();
  for (const q of quotes) {
    const p = parseOptionSymbol(q.symbol);
    if (!p) continue;
    const row = rows.get(p.strike) ?? { strike: p.strike, call: null, put: null };
    row[p.side] = q;
    rows.set(p.strike, row);
  }
  return [...rows.values()].sort((a, b) => a.strike - b.strike);
}

/** Strike nearest to the price (the at-the-money row), null without rows. */
export function atmStrike(rows: readonly OptionRow[], price: number | null): number | null {
  if (!rows.length || price == null) return null;
  let best = rows[0].strike;
  for (const r of rows) if (Math.abs(r.strike - price) < Math.abs(best - price)) best = r.strike;
  return best;
}

/**
 * At-the-money implied volatility: the mean IV of the call and put at the strike nearest to the
 * price (whichever has one).
 */
export function atmIv(rows: readonly OptionRow[], price: number | null): number | null {
  const k = atmStrike(rows, price);
  const r = rows.find((x) => x.strike === k);
  if (!r) return null;
  const ivs = [r.call?.iv, r.put?.iv].filter((v): v is number => typeof v === "number" && v > 0);
  return ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null;
}

/** Volatility smile: IV per strike (out-of-the-money side: puts below the price, calls above). */
export function smile(rows: readonly OptionRow[], price: number | null): { strike: number; iv: number }[] {
  const out: { strike: number; iv: number }[] = [];
  for (const r of rows) {
    const q = price != null && r.strike < price ? (r.put ?? r.call) : (r.call ?? r.put);
    if (q?.iv != null && q.iv > 0) out.push({ strike: r.strike, iv: q.iv });
  }
  return out;
}

/** Put / call ratio of a measure (open interest or volume) over the rows; null when calls are 0. */
export function putCallRatio(rows: readonly OptionRow[], measure: "openInterest" | "volume"): number | null {
  let c = 0;
  let p = 0;
  for (const r of rows) {
    c += r.call?.[measure] ?? 0;
    p += r.put?.[measure] ?? 0;
  }
  return c > 0 ? p / c : null;
}

/** Expiry code (YYMMDD, UTC) of a time in ms. */
export function expiryCode(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCFullYear() % 100)}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}
