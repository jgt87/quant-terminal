// Shared contracts for the roadmap features (phase G). Dependency-free; re-exported from index.ts.
import type { Bar, Interval, Quote, Series } from "./types";
import type { FlowEventKind } from "./orderflow/detect";

// ---------- Chart transforms ----------

export type TransformKind = "renko" | "kagi" | "linebreak" | "pnf" | "range";

export interface TransformOptions {
  renko?: { boxSize: number | "atr"; atrLength?: number; source?: "close" | "hl" };
  kagi?: { reversal: number; mode: "absolute" | "percent" };
  linebreak?: { lines: number };
  pnf?: { boxSize: number | "atr"; reversal: number; atrLength?: number };
  range?: { range: number };
}

/** Transformed bars are not time-uniform; `time` is the time of the bar that completed each brick/box. */
export interface TransformedBar extends Bar {
  /** Direction of the brick/column/line: 1 up, -1 down. */
  dir: 1 | -1;
  /** Index of the source bar that completed this element. */
  sourceIndex: number;
}

// ---------- Patterns & structure ----------

export interface Pivot {
  index: number;
  time: number;
  price: number;
  kind: "high" | "low";
}

export interface CandlePattern {
  index: number;
  time: number;
  /** e.g. "bullish-engulfing", "doji", "hammer", "morning-star". */
  name: string;
  bias: "bullish" | "bearish" | "neutral";
  /** Number of bars that form the pattern (ending at index). */
  bars: number;
}

export interface ChartPattern {
  /** e.g. "double-top", "head-and-shoulders", "ascending-triangle", "rising-wedge". */
  name: string;
  bias: "bullish" | "bearish" | "neutral";
  /** Key points in data space, in drawing order. */
  points: { time: number; price: number }[];
  startIndex: number;
  endIndex: number;
  /** Measured-move target, when the pattern defines one. */
  target?: number;
}

// ---------- Volume profile / TPO ----------

export interface ProfileRow {
  priceLow: number;
  priceHigh: number;
  volume: number;
  upVolume: number;
  downVolume: number;
}

export interface VolumeProfile {
  rows: ProfileRow[];
  /** Point of control (row midpoint with max volume), value area high/low (default 70%). */
  poc: number;
  vah: number;
  val: number;
  startIndex: number;
  endIndex: number;
}

export interface TpoProfile {
  /** Letters per price row (one letter per period), from low to high price. */
  rows: { price: number; letters: string }[];
  poc: number;
  vah: number;
  val: number;
  initialBalance: { high: number; low: number };
  sessionStart: number;
}

// ---------- Alerts ----------

export type AlertOperand =
  | { kind: "price"; field?: "close" | "high" | "low" }
  | { kind: "value"; value: number }
  | { kind: "indicator"; indicatorId: string; inputs: Record<string, number | string | boolean>; output: string }
  /** A drawing of a saved layout; `layoutId` falls back to `Alert.layoutId`. */
  | { kind: "drawing"; drawingId: string; layoutId?: string }
  /** Number of order flow signals of this kind in the bar (Binance symbols; 0 when none). */
  | { kind: "orderflow"; event: FlowEventKind };

export type AlertOperator =
  | "crosses"
  | "crosses-up"
  | "crosses-down"
  | "greater"
  | "less"
  | "enters-channel"
  | "exits-channel"
  | "moving-up-pct"
  | "moving-down-pct";

export interface AlertCondition {
  left: AlertOperand;
  op: AlertOperator;
  right: AlertOperand;
  /** For moving-up/down-pct: percent and lookback bars. */
  pct?: number;
  bars?: number;
}

export interface Alert {
  id: string;
  name: string;
  symbol: string;
  interval: Interval;
  /** All conditions must hold (AND). */
  conditions: AlertCondition[];
  trigger: "once" | "once-per-bar" | "once-per-bar-close" | "every-time";
  expiresAt?: number;
  active: boolean;
  message: string;
  notify: { browser: boolean; sound?: string; webhookUrl?: string };
  createdAt: number;
  lastFiredAt?: number;
  /** Layout whose drawings the drawing operands refer to (optional). */
  layoutId?: string;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  symbol: string;
  time: number;
  price: number;
  message: string;
  seen: boolean;
  /** Optional: alert name and the open time (UTC seconds) of the bar the alert fired on. */
  alertName?: string;
  barTime?: number;
}

// ---------- Screener ----------

export type ScreenerField =
  | "close"
  | "changePct"
  | "volume"
  | "rsi14"
  | "sma50"
  | "sma200"
  | "ema20"
  | "atr14Pct"
  | "perf1W"
  | "perf1M"
  | "perf3M"
  | "perfYTD"
  | "high52wPct"
  | "low52wPct"
  | "relVolume";

export interface ScreenerFilter {
  field: ScreenerField;
  op: ">" | "<" | ">=" | "<=" | "between" | "above-field" | "below-field";
  value?: number;
  value2?: number;
  /** For above-field / below-field (e.g. close above sma200). */
  otherField?: ScreenerField;
}

export interface ScreenerRequest {
  universe: string;
  symbols?: string[];
  filters: ScreenerFilter[];
  sort?: { field: ScreenerField; dir: "asc" | "desc" };
  columns?: ScreenerField[];
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  values: Partial<Record<ScreenerField, number | null>>;
}

// ---------- Portfolios & paper trading ----------

export interface PortfolioTransaction {
  id: string;
  time: number;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee: number;
  note?: string;
}

export interface Portfolio {
  id: string;
  name: string;
  currency: string;
  cash: number;
  transactions: PortfolioTransaction[];
}

export interface Holding {
  symbol: string;
  qty: number;
  avgPrice: number;
  last: number | null;
  marketValue: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number;
}

export type PaperOrderType = "market" | "limit" | "stop" | "stop-limit";

export interface PaperOrder {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  type: PaperOrderType;
  qty: number;
  /** Limit price (limit, stop-limit) or stop price (stop). */
  price?: number;
  /** Stop-limit: the trigger price; once reached the order works as a limit at `price`. */
  stopPrice?: number;
  /** Stop-limit: the stop price was reached. */
  triggered?: boolean;
  stopLoss?: number;
  takeProfit?: number;
  status: "working" | "filled" | "cancelled" | "rejected";
  createdAt: number;
  filledAt?: number;
  fillPrice?: number;
}

export interface PaperAccount {
  id: string;
  currency: string;
  balance: number;
  commissionBps: number;
  slippageBps: number;
  orders: PaperOrder[];
  /** Net positions by symbol. */
  positions: Record<string, { qty: number; avgPrice: number }>;
  history: { time: number; equity: number }[];
}

// ---------- Workspace (multi-chart, tabs, linking) ----------

export type LinkColor = "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "purple" | "pink" | "grey";

export interface LinkGroup {
  color: LinkColor;
  symbol: boolean;
  interval: boolean;
  time: boolean;
}

export type GridKind = "1" | "2h" | "2v" | "3" | "4" | "6" | "8" | "9" | "12" | "16";

export interface WorkspaceTab {
  id: string;
  name: string;
  grid: GridKind;
  /** One layout id per cell (each cell is a full chart Layout). */
  cells: { layoutId: string; link?: LinkColor }[];
  /** Relative sizes of grid splits, optional. */
  sizes?: number[];
}

export interface Workspace {
  id: string;
  tabs: WorkspaceTab[];
  activeTab: string;
  linkGroups: LinkGroup[];
  crosshairSync: boolean;
  /** Optional: every chart of a tab follows the visible time range of the chart being moved. */
  timeSync?: boolean;
  updatedAt: number;
  /**
   * Last linked symbol/interval per link color with the time it was set (UTC ms); cells of other
   * tabs adopt newer values when they mount. Optional.
   */
  linkValues?: Partial<Record<LinkColor, { symbol?: string; symbolAt?: number; interval?: Interval; customInterval?: string; intervalAt?: number }>>;
}

// ---------- Scripting ----------

export interface UserScript {
  id: string;
  name: string;
  kind: "indicator" | "strategy";
  /** Source in the app's scripting language (sandboxed JS/TS subset with the core API). */
  source: string;
  updatedAt: number;
}

export interface ScriptRunResult {
  /** Indicator outputs aligned to bars. */
  outputs?: Record<string, Series>;
  plots?: { key: string; title: string; style: "line" | "histogram" | "dots"; color?: string; pane: "overlay" | "separate" }[];
  error?: { message: string; line?: number; column?: number };
  logs?: string[];
}

// ---------- Events (dividends / splits / earnings) ----------

export interface CorporateEvent {
  time: number;
  kind: "dividend" | "split" | "earnings";
  /** Dividend amount, or split ratio as "4:1". */
  value: number | string;
}

export type { Quote };
