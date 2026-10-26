// Number and time formatting for axes, legends and panels. Pure functions (no DOM).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MINUS = "−";
const DASH = "—";

/** Decimal places for a price, by magnitude. `fx` quotes get pip precision. */
export function priceDecimals(price: number, fx = false): number {
  const a = Math.abs(price);
  if (!isFinite(a) || a === 0) return 2;
  if (fx) return a >= 20 ? 3 : 5;
  if (a >= 10) return 2;
  if (a >= 1) return 4;
  if (a >= 0.01) return 5;
  // Very small prices: keep about 4 significant digits.
  return Math.min(10, Math.ceil(-Math.log10(a)) + 3);
}

export function formatPrice(price: number | null | undefined, decimals?: number): string {
  if (price == null || !isFinite(price)) return DASH;
  const d = decimals ?? priceDecimals(price);
  const s = Math.abs(price).toFixed(d);
  return price < 0 && Number(s) !== 0 ? MINUS + s : s;
}

/** Decimals needed to show a tick step without losing information. */
export function stepDecimals(step: number): number {
  if (!(step > 0) || !isFinite(step)) return 2;
  let d = 0;
  while (d < 10) {
    const scaled = step * Math.pow(10, d);
    if (Math.abs(scaled - Math.round(scaled)) < 1e-6 * Math.max(1, scaled)) return d;
    d++;
  }
  return d;
}

export function formatCompact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return DASH;
  const a = Math.abs(v);
  const sign = v < 0 ? MINUS : "";
  if (a >= 1e12) return sign + (a / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return sign + (a / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return sign + (a / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return sign + (a / 1e3).toFixed(2) + "K";
  return sign + (Number.isInteger(a) ? a.toString() : a.toFixed(2));
}

export function formatSigned(v: number | null | undefined, decimals = 2, suffix = ""): string {
  if (v == null || !isFinite(v)) return DASH;
  const s = Math.abs(v).toFixed(decimals);
  if (Number(s) === 0) return s + suffix;
  return (v > 0 ? "+" : MINUS) + s + suffix;
}

export function formatPct(v: number | null | undefined, decimals = 2): string {
  return formatSigned(v, decimals, "%");
}

export function formatNumber(v: number | null | undefined, decimals = 2): string {
  if (v == null || !isFinite(v)) return DASH;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return v < 0 && Number(Math.abs(v).toFixed(decimals)) !== 0 ? MINUS + s : s;
}

const pad = (n: number) => (n < 10 ? "0" + n : String(n));

/** Full timestamp for crosshair labels. Times are shown in UTC. */
export function formatTimeFull(t: number, intraday: boolean): string {
  const d = new Date(t * 1000);
  const date = `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ’${pad(d.getUTCFullYear() % 100)}`;
  return intraday ? `${date}  ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : date;
}

export function formatDate(t: number): string {
  const d = new Date(t * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function formatDateTime(t: number, intraday = true): string {
  if (!intraday) return formatDate(t);
  const d = new Date(t * 1000);
  return `${formatDate(t)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

interface TimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function timeParts(t: number): TimeParts {
  const d = new Date(t * 1000);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes() };
}

/** Axis label for a tick, naming the coarsest calendar unit that changed vs. the previous bar. */
export function tickLabel(t: number, prev: number | null, spanSec: number): { text: string; major: boolean } {
  const p = timeParts(t);
  const q = prev == null ? null : timeParts(prev);
  if (spanSec >= 365 * 86400 || (q && q.year !== p.year)) return { text: String(p.year), major: true };
  if (spanSec >= 28 * 86400 || (q && q.month !== p.month)) return { text: MONTHS[p.month], major: spanSec < 28 * 86400 };
  if (spanSec >= 86400 || (q && q.day !== p.day)) return { text: String(p.day), major: spanSec < 86400 };
  return { text: `${pad(p.hour)}:${pad(p.minute)}`, major: false };
}
