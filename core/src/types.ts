// Shared contracts between core, server and web. Keep this file dependency-free.

import type { TransformOptions } from "./types-ext";

/** One OHLCV bar. `time` is the bar open in UTC seconds. */
export interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export const INTERVALS = ["1m", "5m", "15m", "30m", "1h", "4h", "1D", "1W", "1M"] as const;
export type Interval = (typeof INTERVALS)[number];

/** Nominal interval length in seconds (1M uses 30 days; only for spacing/estimates). */
export const INTERVAL_SECONDS: Record<Interval, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "4h": 14400,
  "1D": 86400,
  "1W": 604800,
  "1M": 2592000,
};

export type Provider = "yahoo" | "binance" | "mt5";
export type SymbolType = "stock" | "index" | "crypto" | "fx" | "etf" | "future" | "other";

export interface SymbolInfo {
  /** Canonical id used everywhere in the app, e.g. "AAPL", "^NDX", "BINANCE:BTCUSDT". */
  symbol: string;
  name: string;
  exchange: string;
  type: SymbolType;
  currency: string;
  provider: Provider;
  /** IANA time zone of the exchange (e.g. "America/New_York"), when the provider reports it. */
  timezone?: string;
  /** Regular session in exchange-local time, "HHMM-HHMM" (e.g. "0930-1600"), when known. */
  session?: string;
}

export interface Quote {
  symbol: string;
  last: number;
  change: number;
  changePct: number;
  /** UTC seconds of the last trade/update. */
  time: number;
}

export interface BarsResponse {
  symbol: SymbolInfo;
  interval: Interval;
  bars: Bar[];
  /** False when the provider has no older data before bars[0]. */
  hasMore: boolean;
}

export interface ApiError {
  error: { code: "bad_request" | "not_found" | "provider_error" | "internal" | "conflict"; message: string };
}

/** Body of a 409 from PUT /api/layouts/:id: the stored layout is newer than the client's base. */
export interface LayoutConflict extends ApiError {
  layout: Layout;
}

// ---------- Indicators ----------

export type InputValue = number | string | boolean;

export interface IndicatorInputDef {
  key: string;
  label: string;
  type: "int" | "float" | "source" | "bool";
  default: InputValue;
  min?: number;
  max?: number;
  step?: number;
}

export type Source = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4";

export interface IndicatorOutputDef {
  key: string;
  label: string;
  /** How the web layer should draw it. */
  style: "line" | "histogram" | "band-upper" | "band-lower" | "dots";
  /**
   * The series may run past the last bar (projected values such as the Ichimoku cloud): it is
   * then longer than the bars, and index `bars.length + k` is k + 1 bars ahead of the last bar.
   */
  forward?: boolean;
}

/** Values aligned 1:1 with the input bars; null during warm-up. */
export type Series = (number | null)[];

export interface IndicatorDef {
  id: string;
  name: string;
  shortName: string;
  pane: "overlay" | "separate";
  inputs: IndicatorInputDef[];
  outputs: IndicatorOutputDef[];
  /** Optional fixed scale range for separate panes (e.g. RSI 0..100) and guide levels. */
  range?: { min: number; max: number };
  levels?: number[];
  compute(bars: Bar[], inputs: Record<string, InputValue>): Record<string, Series>;
}

export interface IndicatorInstance {
  /** Unique per layout. */
  uid: string;
  indicatorId: string;
  inputs: Record<string, InputValue>;
  visible: boolean;
  /** Optional per-output style overrides; missing values use the theme defaults. */
  style?: IndicatorStyle;
  /** Optional per-interval-group visibility (missing groups are visible). */
  visibility?: IntervalVisibility;
  /** Optional pane override: draw a separate-pane indicator on the price pane or vice versa. */
  pane?: "overlay" | "separate";
  /**
   * Optional: share the pane of another separate-pane indicator (its uid) instead of getting a
   * pane of its own. Ignored when that indicator is gone or not in a separate pane.
   */
  paneWith?: string;
  /**
   * Optional: "own" fits the indicator to its own scale without an axis (overlay); "left" fits it
   * to its own scale shown on the pane's left price axis.
   */
  scale?: "own" | "left";
  /**
   * Optional higher timeframe (e.g. "1D"): computed on that interval's bars and aligned to the
   * chart without look-ahead. Missing = the chart's own bars.
   */
  timeframe?: string;
}

export type LineStyle = "solid" | "dashed" | "dotted";

export interface OutputStyle {
  visible?: boolean;
  /** CSS color: #rrggbb or #rrggbbaa. */
  color?: string;
  width?: number;
  lineStyle?: LineStyle;
}

export interface IndicatorStyle {
  outputs?: Record<string, OutputStyle>;
  /** Guide level lines (e.g. RSI 30/70); default on. */
  levels?: boolean;
}

// ---------- Visibility by interval ----------

export type IntervalGroup = "minutes" | "hours" | "days" | "weeks" | "months";

/** Interval groups of the drawing visibility rules ("seconds" never matches the built-in intervals). */
export type VisibilityGroup = "seconds" | IntervalGroup;

/** Inclusive multiplier range inside one group, e.g. minutes 5..30 (5m, 15m, 30m). */
export interface IntervalRange {
  min: number;
  max: number;
}

/**
 * false hides the item on intervals of that group; a range shows it only for multipliers inside
 * the range; a missing group (or true) means visible.
 */
export type IntervalVisibility = Partial<Record<VisibilityGroup, boolean | IntervalRange>>;

// ---------- Drawings ----------

export interface Anchor {
  /** UTC seconds; may lie beyond the last bar (future area). */
  time: number;
  price: number;
}

/** Drawing types that existed before the tool registry (old layouts use only these). */
export type BuiltinDrawingType =
  | "trendline"
  | "ray"
  | "extended"
  | "hline"
  | "hray"
  | "vline"
  | "rectangle"
  | "channel"
  | "fib"
  | "measure"
  | "text"
  /** Fixed-range volume profile between two anchors' times. */
  | "vprofile"
  /** Anchored volume profile from the anchor's time to the last bar. */
  | "avprofile";

/**
 * Open union: the built-in names plus any tool type registered in the web tool registry
 * (`web/src/chart/drawings/registry.ts`). Unknown types load and save unchanged.
 */
export type DrawingType = BuiltinDrawingType | (string & {});

export interface Drawing {
  id: string;
  type: DrawingType;
  anchors: Anchor[];
  text?: string;
  locked?: boolean;
  /** Hidden drawings are kept but neither drawn nor hit-tested. */
  hidden?: boolean;
  style?: DrawingStyle;
  /** Optional per-interval-group visibility (missing groups are visible). */
  visibility?: IntervalVisibility;
  /** Path vertices of freehand (brush) and poly (path/polyline) tools, in data space. */
  points?: Anchor[];
  /** Tool-specific settings (see the tool's settings schema), e.g. extendLeft, showStats. */
  props?: Record<string, unknown>;
  /** User group (Layout.groups) this drawing belongs to. */
  groupId?: string;
  /** Optional stacking order; drawings with equal zIndex keep their list order. */
  zIndex?: number;
  /** Name of the template last applied (informational). */
  templateName?: string;
  /** User-given name shown in the object tree (default: the tool label). */
  name?: string;
}

/** A user group of drawings (object tree). Drawings refer to it by `groupId`. */
export interface DrawingGroup {
  id: string;
  name: string;
  /** Symbol whose drawings the group holds (drawings are kept per symbol). */
  symbol: string;
}

export interface FibLevel {
  ratio: number;
  color?: string;
  visible?: boolean;
  /** Optional per-level line width / style (channel and pitchfork levels). */
  width?: number;
  lineStyle?: LineStyle;
  /** Optional per-level label text. */
  text?: string;
}

export interface DrawingStyle {
  width?: number;
  dash?: number[];
  opacity?: number;
  /** Line color (#rrggbb or #rrggbbaa); default is the theme accent. */
  color?: string;
  lineStyle?: LineStyle;
  /** Fill opacity 0..1 for rectangle / channel / fib / measure. */
  fillOpacity?: number;
  /** Fib: show level lines and labels (default on) and the editable level list. */
  fibLevels?: boolean;
  levels?: FibLevel[];
  /** Background fill color (#rrggbb[aa]); missing = the line color at `fillOpacity`. */
  fillColor?: string;
  /** Text drawings. */
  textSize?: number;
  bold?: boolean;
  italic?: boolean;
  /** Text color; missing = the line color. */
  textColor?: string;
}

/** Number of anchors each tool needs to be complete. */
export const DRAWING_ANCHORS: Record<BuiltinDrawingType, number> = {
  trendline: 2,
  ray: 2,
  extended: 2,
  hline: 1,
  hray: 1,
  vline: 1,
  rectangle: 2,
  channel: 3,
  fib: 2,
  measure: 2,
  text: 1,
  vprofile: 2,
  avprofile: 1,
};

// ---------- Persistence ----------

export type ChartType =
  | "candles"
  | "hollow"
  | "bars"
  | "line"
  | "area"
  | "heikin-ashi"
  | "baseline"
  | "columns"
  | "volume-candles"
  | "hlc-area"
  | "high-low"
  | "line-markers"
  | "step-line"
  /** Price-only transforms (non-time-uniform, drawn on an index axis). */
  | "renko"
  | "kagi"
  | "linebreak"
  | "pnf"
  | "range";

export interface Layout {
  id: string;
  name: string;
  symbol: string;
  interval: Interval;
  chartType: ChartType;
  logScale: boolean;
  indicators: IndicatorInstance[];
  /** Drawings are kept per symbol so switching symbols does not mix them. */
  drawings: Record<string, Drawing[]>;
  /**
   * Optional relative heights of the chart panes: key "main" for the price pane, otherwise the
   * uid of the separate-pane indicator. Missing entries use the defaults.
   */
  paneRatios?: Record<string, number>;
  /** Optional chart appearance overrides (colors, status line, scales). */
  chartSettings?: ChartSettings;
  /**
   * Optional custom interval such as "2h", "3D" or "45m". `interval` then holds the provider
   * interval the bars are fetched in (and resampled from).
   */
  customInterval?: string;
  /** Optional compare symbols drawn as percent overlays on the price pane. */
  compare?: string[];
  /** Optional user groups of drawings (object tree). */
  groups?: DrawingGroup[];
  updatedAt: number;
}

/** Order flow parts shown on a chart (Binance symbols). */
export interface OrderFlowFlags {
  footprint?: boolean;
  bubbles?: boolean;
  delta?: boolean;
  cvd?: boolean;
  /** Liquidity heatmap (resting order book size over time) behind the candles. */
  heatmap?: boolean;
  /** Absorption, stop run and iceberg markers. */
  signals?: boolean;
}

export interface ChartSettings {
  symbol?: {
    upColor?: string;
    downColor?: string;
    upBorder?: string;
    downBorder?: string;
    upWick?: string;
    downWick?: string;
    hollow?: boolean;
    /** Parameters of the price-only chart types (renko, kagi, line break, P&F, range). */
    transform?: TransformOptions;
    /** Baseline chart: base price (missing = close of the first visible bar). */
    baseline?: number;
    /** Bar options sent to the server: dividend-adjusted prices, extended trading hours. */
    adjustDividends?: boolean;
    extendedHours?: boolean;
  };
  statusLine?: { ohlc?: boolean; change?: boolean; volume?: boolean; indicatorValues?: boolean };
  scales?: {
    lastPriceLabel?: boolean;
    priceLine?: boolean;
    /** Main price axis side; "both" shows it on the left and the right. */
    placement?: "right" | "left" | "both";
    /** Percent mode of the main price scale (relative to the first visible bar). */
    percent?: boolean;
    /** Indexed to 100: the first visible bar's close is 100 (takes precedence over percent). */
    indexed?: boolean;
    /** Inverted main price scale (higher prices lower on the chart). */
    inverted?: boolean;
  };
  /** Crypto order flow (Binance symbols): footprint cells, volume bubbles, delta panes, liquidity heatmap. */
  orderFlow?: OrderFlowFlags;
  /** Time zone of the time axis, crosshair and tables: "UTC" (default), "local", "exchange" or an IANA zone. */
  timeZone?: string;
  appearance?: {
    background?: string;
    gridVertical?: boolean;
    gridHorizontal?: boolean;
    crosshair?: "dashed" | "dotted" | "solid" | "hidden";
    /** Dashed vertical lines where a new day starts in the chart's time zone (intraday). */
    sessionBreaks?: boolean;
  };
}

/** Watchlist flag colors (a subset of the workspace link colors). */
export const FLAG_COLORS = ["red", "orange", "yellow", "green", "cyan", "blue", "purple"] as const;
export type FlagColor = (typeof FLAG_COLORS)[number];

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
  /** Optional flag color per symbol (keys are symbols of this list). */
  flags?: Record<string, FlagColor>;
}

// ---------- Backtesting ----------

export type Side = "long" | "short";

export interface StrategyParamDef {
  key: string;
  label: string;
  type: "int" | "float";
  default: number;
  min?: number;
  max?: number;
  step?: number;
}

/** What a strategy may do on bar i. It only ever sees bars[0..i]. */
export interface StrategyContext {
  index: number;
  bars: readonly Bar[];
  position: { side: Side; qty: number; entryPrice: number } | null;
  /** Indicator helper results precomputed in init(); read only up to index. */
  data: Record<string, Series>;
}

export type Signal =
  | { action: "enter"; side: Side }
  | { action: "exit" }
  | { action: "reverse"; side: Side }
  | null;

export interface StrategyDef {
  id: string;
  name: string;
  description: string;
  params: StrategyParamDef[];
  /** Precompute series (must be causal: value i uses only bars[0..i]). */
  init(bars: Bar[], params: Record<string, number>): Record<string, Series>;
  onBar(ctx: StrategyContext, params: Record<string, number>): Signal;
}

export interface BacktestConfig {
  initialCapital: number;
  /** Commission in basis points of notional per side. */
  commissionBps: number;
  /** Fixed commission per order (account currency). */
  commissionFixed: number;
  /** Slippage in basis points, always against the trader. */
  slippageBps: number;
  sizing: { mode: "percent-equity"; percent: number } | { mode: "fixed-qty"; qty: number } | { mode: "fixed-cash"; cash: number };
  allowShort: boolean;
  /** Optional protective exits in percent of entry price (e.g. 5 = 5%). */
  stopLossPct?: number;
  takeProfitPct?: number;
  /** Bars per year for annualization (252 for daily stocks, 365 for daily crypto, etc). */
  barsPerYear: number;
  riskFreeRate?: number;
}

export interface Trade {
  side: Side;
  entryIndex: number;
  entryTime: number;
  entryPrice: number;
  exitIndex: number;
  exitTime: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  barsHeld: number;
  exitReason: "signal" | "stop" | "target" | "end";
}

export interface EquityPoint {
  time: number;
  equity: number;
  drawdownPct: number;
  benchmark: number;
}

export interface BacktestMetrics {
  totalReturnPct: number;
  cagrPct: number;
  volatilityPct: number;
  sharpe: number;
  sortino: number;
  maxDrawdownPct: number;
  maxDrawdownBars: number;
  calmar: number;
  winRatePct: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  exposurePct: number;
  trades: number;
  totalFees: number;
  benchmarkReturnPct: number;
}

export interface BacktestResult {
  trades: Trade[];
  equity: EquityPoint[];
  metrics: BacktestMetrics;
}
