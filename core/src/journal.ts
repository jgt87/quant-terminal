// Trade journal: paper fills grouped into round trips (flat → position → flat per symbol), summary
// statistics, the user's notes and tags per trade, and a CSV export. Pure.

export interface JournalFill {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  fillPrice: number;
  /** ms */
  filledAt: number;
  /** Realized P&L of this fill (before commission). */
  realizedPnl?: number;
  commission?: number;
}

export interface RoundTrip {
  /** Id of the fill that opened the trade (stable, used to attach notes). */
  id: string;
  symbol: string;
  side: "long" | "short";
  /** Largest position size during the trade. */
  qty: number;
  entryTime: number;
  /** Average price of the opening fills. */
  entryPrice: number;
  exitTime: number | null;
  /** Average price of the closing fills (null while nothing is closed). */
  exitPrice: number | null;
  /** Quantity closed so far. */
  closedQty: number;
  realizedPnl: number;
  commission: number;
  /** realizedPnl - commission */
  netPnl: number;
  fills: number;
  /** Still holding a position. */
  open: boolean;
}

export interface TradeNote {
  note: string;
  tags: string[];
  updatedAt: number;
}

export interface TradeJournalDoc {
  notes: Record<string, TradeNote>;
}

export const MAX_NOTE_LENGTH = 2000;
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

const EPS = 1e-9;

interface Building {
  trip: RoundTrip;
  entryQty: number;
  entryCost: number;
  exitCost: number;
}

/** Round trips of the fills, newest first. Orders with no fill (or no fill price) are ignored. */
export function roundTrips(fills: readonly JournalFill[]): RoundTrip[] {
  const sorted = fills.filter((f) => f.qty > 0 && Number.isFinite(f.fillPrice) && Number.isFinite(f.filledAt)).sort((a, b) => a.filledAt - b.filledAt);
  const pos = new Map<string, number>();
  const open = new Map<string, Building>();
  const done: RoundTrip[] = [];

  const start = (f: JournalFill, signed: number, commission: number): Building => {
    const b: Building = {
      trip: {
        id: f.id,
        symbol: f.symbol,
        side: signed > 0 ? "long" : "short",
        qty: Math.abs(signed),
        entryTime: f.filledAt,
        entryPrice: f.fillPrice,
        exitTime: null,
        exitPrice: null,
        closedQty: 0,
        realizedPnl: 0,
        commission,
        netPnl: -commission,
        fills: 1,
        open: true,
      },
      entryQty: Math.abs(signed),
      entryCost: Math.abs(signed) * f.fillPrice,
      exitCost: 0,
    };
    open.set(f.symbol, b);
    return b;
  };

  for (const f of sorted) {
    const key = f.symbol;
    const p = pos.get(key) ?? 0;
    const signed = f.side === "buy" ? f.qty : -f.qty;
    const fee = f.commission ?? 0;
    const cur = open.get(key);
    if (Math.abs(p) < EPS || !cur) {
      start(f, signed, fee);
      pos.set(key, signed);
      continue;
    }
    const t = cur.trip;
    t.fills++;
    if (Math.sign(p) === Math.sign(signed)) {
      // Adding to the position.
      cur.entryQty += f.qty;
      cur.entryCost += f.qty * f.fillPrice;
      t.entryPrice = cur.entryCost / cur.entryQty;
      t.commission += fee;
      const next = p + signed;
      t.qty = Math.max(t.qty, Math.abs(next));
      t.netPnl = t.realizedPnl - t.commission;
      pos.set(key, next);
      continue;
    }
    // Reducing, closing or flipping.
    const closing = Math.min(f.qty, Math.abs(p));
    const share = closing / f.qty;
    cur.exitCost += closing * f.fillPrice;
    t.closedQty += closing;
    t.exitPrice = cur.exitCost / t.closedQty;
    t.exitTime = f.filledAt;
    t.realizedPnl += f.realizedPnl ?? 0;
    t.commission += fee * share;
    t.netPnl = t.realizedPnl - t.commission;
    const next = p + signed;
    if (Math.abs(next) < EPS || Math.sign(next) !== Math.sign(p)) {
      t.open = false;
      done.push(t);
      open.delete(key);
      pos.set(key, 0);
      // A flip opens a new trade with the rest of the fill.
      if (Math.abs(next) >= EPS) {
        start({ ...f, qty: Math.abs(next) }, next, fee * (1 - share));
        pos.set(key, next);
      }
    } else {
      pos.set(key, next);
    }
  }
  return [...done, ...[...open.values()].map((b) => b.trip)].sort((a, b) => b.entryTime - a.entryTime);
}

export interface JournalStats {
  /** Closed trades. */
  trades: number;
  wins: number;
  losses: number;
  /** 0..1, null without closed trades. */
  winRate: number | null;
  netPnl: number;
  grossProfit: number;
  grossLoss: number;
  /** grossProfit / |grossLoss|; null without losses. */
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  best: number | null;
  worst: number | null;
}

/** Statistics over the closed trades (net of commission). */
export function journalStats(trips: readonly RoundTrip[]): JournalStats {
  const closed = trips.filter((t) => !t.open);
  const wins = closed.filter((t) => t.netPnl > 0);
  const losses = closed.filter((t) => t.netPnl < 0);
  const sum = (l: RoundTrip[]) => l.reduce((s, t) => s + t.netPnl, 0);
  const grossProfit = sum(wins);
  const grossLoss = sum(losses);
  const pnl = closed.map((t) => t.netPnl);
  return {
    trades: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate: closed.length ? wins.length / closed.length : null,
    netPnl: sum(closed),
    grossProfit,
    grossLoss,
    profitFactor: losses.length ? grossProfit / Math.abs(grossLoss) : null,
    avgWin: wins.length ? grossProfit / wins.length : null,
    avgLoss: losses.length ? grossLoss / losses.length : null,
    best: pnl.length ? Math.max(...pnl) : null,
    worst: pnl.length ? Math.min(...pnl) : null,
  };
}

/** Tags typed as "breakout, news #fomo": split on commas, spaces and #, deduplicated, trimmed. */
export function parseTags(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.split(/[\s,#]+/)) {
    const t = raw.trim().slice(0, MAX_TAG_LENGTH);
    if (t && !out.includes(t) && out.length < MAX_TAGS) out.push(t);
  }
  return out;
}

const iso = (ms: number | null) => (ms === null ? "" : new Date(ms).toISOString());
const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the trades with their notes and tags (UTC times). */
export function journalCsv(trips: readonly RoundTrip[], notes: TradeJournalDoc["notes"] = {}): string {
  const head = ["symbol", "side", "qty", "entry_time", "entry_price", "exit_time", "exit_price", "realized_pnl", "commission", "net_pnl", "status", "tags", "note"];
  const rows = trips.map((t) => {
    const n = notes[t.id];
    return [t.symbol, t.side, t.qty, iso(t.entryTime), t.entryPrice, iso(t.exitTime), t.exitPrice ?? "", t.realizedPnl, t.commission, t.netPnl, t.open ? "open" : "closed", n?.tags.join(" ") ?? "", n?.note ?? ""]
      .map(cell)
      .join(",");
  });
  return [head.join(","), ...rows].join("\n") + "\n";
}
