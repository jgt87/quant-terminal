// Framework-agnostic chart engine: owns the canvases, scales, panes, data and drawing tools,
// batches redraws with requestAnimationFrame, and reports state through events.

import { distanceToSegment, visibleOnInterval } from "@qt/core";
import type { Anchor, Bar, BarFlow, ChartSettings, ChartType, CorporateEvent, Drawing, FootprintBar, IndicatorInstance, Interval, ScriptRunResult, Series, TransformKind } from "@qt/core";
import { flowIndicators, groupDelta, groupFootprints } from "./orderFlow";
import { tradeLineHit, type TradeLine } from "./tradeLines";
import { CanvasLayer } from "./canvas";
import { DrawingController, type Tool } from "./drawings/DrawingController";
import { drawingVisible } from "./drawings/visible";
import { Emitter } from "./Emitter";
import { IndicatorSet } from "./IndicatorSet";
import { ChartInteraction } from "./Interaction";
import { layoutPanes, Pane } from "./Pane";
import { PriceScale } from "./PriceScale";
import { renderScene, renderUi, fitScales } from "./render";
import type { TradeMarker } from "./renderers/overlays";
import { heikinAshi, SeriesData, type UpsertResult } from "./SeriesData";
import { chartTheme, type ChartTheme, type ThemeMode } from "./theme";
import type { ComputedIndicator } from "./IndicatorSet";
import { outputStyle } from "./indicatorStyle";
import { TimeScale } from "./TimeScale";
import { buildLegend, type LegendData } from "./legend";
import { alignCloses, type CompareSeries } from "./compare";
import { placeEventMarkers, type EventMarker } from "./events";
import { countAtOrBefore, formingBar, REPLAY_OFF, replayReducer, revealBars, TICK_FRAME_MS, tickStep, type ReplayAction, type ReplayState, type ReplayTick } from "./replay";
import { scriptIndicators } from "./scriptPlots";
import { StudyCache } from "./studies/cache";
import type { StudyResult } from "./studies/compute";
import { studyHit } from "./studies/render";
import { lastAtrValue, pnfBoxSize, transformLabel, transformOf, transformSeries, type AxisBar } from "./transform";

const DEFAULT_PANE_RATIO = 0.28;

/**
 * Pane root of each separate-pane indicator: follows `paneWith` while it names another
 * separate-pane indicator (cycles and missing targets end at the indicator itself).
 */
export function paneRoots(items: readonly { uid: string; paneWith?: string }[]): Map<string, string> {
  const by = new Map(items.map((c) => [c.uid, c]));
  const out = new Map<string, string>();
  for (const c of items) {
    let cur = c;
    const seen = new Set<string>([cur.uid]);
    while (cur.paneWith && by.has(cur.paneWith) && !seen.has(cur.paneWith)) {
      cur = by.get(cur.paneWith)!;
      seen.add(cur.uid);
    }
    // A cycle has no natural root: the first member in list order hosts it.
    if (cur.paneWith && seen.has(cur.paneWith) && by.has(cur.paneWith)) cur = items.find((x) => seen.has(x.uid))!;
    out.set(c.uid, cur.uid);
  }
  return out;
}
/** History paging stops at this many source bars on price-only chart types. */
const MAX_TRANSFORM_SOURCE_BARS = 20000;

export interface SeriesMeta {
  symbol: string;
  interval?: Interval;
  intervalSec: number;
  intraday: boolean;
  fx: boolean;
}

export interface PaneInfo {
  id: string;
  main: boolean;
  top: number;
  /** 0 while another pane is maximised. */
  height: number;
  uids: string[];
  collapsed: boolean;
  maximized: boolean;
}

export interface EngineEvents extends Record<string, unknown> {
  hover: number | null;
  layout: PaneInfo[];
  needHistory: number;
  drawings: Drawing[];
  selection: string | null;
  tool: Tool;
  textRequest: { id: string; text: string };
  typeToSearch: string;
  data: number;
  /** Right click inside the chart: client coordinates plus what is under the pointer. */
  contextMenu: { clientX: number; clientY: number; target: ContextTarget };
  /** A scene frame was painted (overlays positioned in chart space can follow). */
  rendered: number;
  /** Pane heights changed by the user (separator drag): "main" or indicator uid → ratio. */
  paneRatios: Record<string, number>;
  /** The user panned/zoomed/reset the time axis: visible range in UTC seconds (link groups). */
  viewChange: { from: number; to: number };
  /** A paper trading line was dragged to a new price, or its × button was clicked. */
  tradeAction: { kind: "move"; line: TradeLine; price: number } | { kind: "button"; line: TradeLine };
  /** Bar Replay state changed (phase, cursor, playing, speed). */
  replay: ReplayState;
  /** The script plots were removed from the chart (legend remove button). */
  scriptPlotsRemoved: null;
  /** Pointer over a corporate event badge (client-relative chart px), null when it leaves. */
  eventHover: { marker: EventMarker; x: number; y: number } | null;
}

/** What a right click hit (decided by the engine's hit-testing). */
export type ContextTarget =
  | { kind: "drawing"; id: string }
  | { kind: "indicator"; uid: string }
  | { kind: "priceAxis"; pane: number }
  | { kind: "chart"; pane: number; price: number; time: number };

export class ChartEngine {
  readonly root: HTMLElement;
  theme: ChartTheme = chartTheme("dark");
  themeMode: ThemeMode = "dark";
  settings: ChartSettings = {};
  /** Left edge of the plot (the price axis width when the scale sits on the left). */
  plotLeft = 0;
  readonly events = new Emitter<EngineEvents>();
  readonly ts = new TimeScale();
  readonly data = new SeriesData();
  readonly indicators = new IndicatorSet();
  readonly drawings: DrawingController;
  readonly scene: CanvasLayer;
  readonly ui: CanvasLayer;
  panes: Pane[] = [new Pane("main", true, 1)];
  /** Id of the maximised pane (the others are hidden), null when none. */
  maximizedPane: string | null = null;
  /** Hidden scales of indicators drawn with `scale: "own"` (fitted each frame). */
  readonly ownScales = new Map<string, PriceScale>();

  meta: SeriesMeta = { symbol: "", intervalSec: 86400, intraday: false, fx: false };
  chartType: ChartType = "candles";
  showVolume = true;
  markers: TradeMarker[] = [];
  /** Fills of the replay paper account (drawn like trade markers). */
  replayMarkers: TradeMarker[] = [];
  message: string | null = null;
  /** Bars as displayed (Heikin-Ashi transformed when that chart type is active). */
  display: Bar[] = [];
  /**
   * Full source series as loaded (all history, live updates). `data` is what the chart shows and
   * computes on: the source up to the replay cursor, transformed for price-only chart types.
   */
  readonly raw = new SeriesData();
  /** Active price-only transform (renko, kagi, ...), null for time-based chart types. */
  transform: TransformKind | null = null;
  /** Point & figure box size of the current elements (for drawing the boxes). */
  pnfBox: number | null = null;
  private transformText: string | null = null;
  replay: ReplayState = REPLAY_OFF;
  /** Tick replay: loads the recorded ticks of [from, to) (UTC seconds); null when the symbol has none. */
  tickSource: ((from: number, to: number) => Promise<ReplayTick[]>) | null = null;
  /** Tick replay status for the replay bar ("Loading ticks…", "No ticks: whole bars"). */
  tickNote: string | null = null;
  private tickPlay: { time: number; ticks: ReplayTick[]; shown: number } | null = null;
  private tickLoading = false;
  /** The bar being formed from ticks (shown after the revealed bars). */
  private replayForming: Bar | null = null;
  compare: CompareSeries[] = [];
  corpEvents: CorporateEvent[] = [];
  eventMarkers: EventMarker[] = [];
  /** Event badges drawn on the time axis in the last frame (plot coordinates) for hover tips. */
  eventHits: { x: number; y: number; r: number; marker: EventMarker }[] = [];
  /** Shade pre-/post-market bars (intraday stocks with extended hours on). */
  shadeExtended = false;
  readonly studies = new StudyCache();
  private htf = new Map<string, readonly Bar[]>();
  private instances: IndicatorInstance[] = [];
  private scriptPlots: { plots: NonNullable<ScriptRunResult["plots"]>; outputs: Record<string, Series> } | null = null;
  private scriptItems: ComputedIndicator[] = [];
  private flowItems: ComputedIndicator[] = [];
  /** Order flow as loaded (provider interval), null when off or not available. */
  private flowRaw: { flow: readonly BarFlow[]; footprints: readonly FootprintBar[]; tick: number } | null = null;
  /** Footprints by displayed bar index, and their price bin size. */
  flowFootprints = new Map<number, FootprintBar>();
  flowTick = 0;
  /** Paper trading lines on the price pane, and the line being dragged (preview price). */
  tradeLines: TradeLine[] = [];
  tradeDrag: { id: string; price: number } | null = null;
  private replayTimer = 0;

  width = 0;
  height = 0;
  plotWidth = 0;
  plotHeight = 0;
  /** Crosshair position in canvas media px, null when the pointer is outside. */
  hover: { x: number; y: number } | null = null;
  hoverSeparator = -1;
  /** Crosshair time mirrored from another chart (crosshair sync), null when none. */
  externalCrosshair: number | null = null;
  private crosshairX: number | null = null;
  private viewNotify = false;

  private interaction: ChartInteraction;
  private ro: ResizeObserver;
  private raf = 0;
  private sceneDirty = true;
  private uiDirty = true;
  private layoutDirty = true;
  private lastHoverIndex: number | null | undefined = undefined;
  private historyRequestedAt: number | null = null;
  private destroyed = false;
  private storedRatios: Record<string, number> = {};

  constructor(root: HTMLElement) {
    this.root = root;
    this.scene = new CanvasLayer(root, "qt-chart-layer qt-chart-scene");
    this.ui = new CanvasLayer(root, "qt-chart-layer qt-chart-ui");
    this.drawings = new DrawingController(
      {
        toPx: (a) => this.toPx(a),
        toData: (p) => this.toData(p),
        bars: () => this.data.bars,
        viewport: () => ({ width: this.plotWidth, height: this.mainPane.height }),
        tolerance: 6,
        isShown: (d) => this.drawingShown(d),
        intervalSec: () => this.meta.intervalSec,
        shiftTime: (t, n) => this.ts.indexToTime(this.ts.timeToIndex(t) + n),
        zoomTo: (x0, x1) => {
          this.ts.setVisibleRange(this.ts.xToIndex(x0), this.ts.xToIndex(x1));
          this.userViewChanged();
        },
      },
      {
        changed: (list) => this.events.emit("drawings", list),
        tool: (t) => this.events.emit("tool", t),
        selection: (id) => this.events.emit("selection", id),
        textRequest: (id, text) => this.events.emit("textRequest", { id, text }),
        redraw: () => this.invalidate(),
      },
    );
    this.interaction = new ChartInteraction(this);
    this.ro = new ResizeObserver(() => {
      this.layoutDirty = true;
      this.invalidate();
    });
    this.ro.observe(root);
    this.invalidate();
  }

  get mainPane(): Pane {
    return this.panes[0];
  }

  // ---------- data ----------

  setData(bars: readonly Bar[], meta: SeriesMeta): void {
    const symbolChanged = meta.symbol !== this.meta.symbol || meta.intervalSec !== this.meta.intervalSec;
    this.meta = meta;
    this.raw.set(bars);
    this.mainPane.ps.fx = meta.fx;
    this.historyRequestedAt = null;
    this.message = null;
    this.rebuild(symbolChanged ? "reset" : "set");
  }

  /** Live update: replace the bar with the same time, else append. */
  upsertBar(bar: Bar): UpsertResult {
    const r = this.raw.upsert(bar);
    this.rebuild("live");
    return r;
  }

  /** Prepend older history without moving the visible bars. Returns bars added. */
  prependBars(bars: readonly Bar[]): number {
    const n = this.raw.prepend(bars);
    if (n > 0) {
      this.historyRequestedAt = null;
      this.rebuild("set");
    }
    return n;
  }

  /** Allow another history request (e.g. after a failed or empty fetch). */
  historyDone(): void {
    this.historyRequestedAt = null;
  }

  clearData(message: string | null): void {
    this.raw.set([]);
    this.message = message;
    this.rebuild("set");
  }

  setMessage(message: string | null): void {
    this.message = message;
    this.invalidate();
  }

  /** Last bar of the source series (live ticks fold into it). */
  lastSourceBar(): Bar | undefined {
    return this.raw.last();
  }

  /**
   * Rebuilds `data` from the source: replay cut-off, then the price-only transform. "live" keeps
   * following the last bar when new elements appear; "reset" restores the default view.
   */
  private rebuild(mode: "reset" | "set" | "live"): void {
    const before = this.data.length;
    let src = revealBars(this.raw.bars, this.replay) as Bar[];
    const forming = this.replayForming;
    if (forming && this.replay.phase === "on" && (!src.length || forming.time > src[src.length - 1].time)) src = [...src, forming];
    let bars: readonly Bar[] = src;
    this.pnfBox = null;
    if (this.transform) {
      const axis = transformSeries(src, this.transform, this.settings.symbol?.transform);
      if (this.transform === "pnf") {
        const o = this.settings.symbol?.transform?.pnf;
        const fixed = typeof o?.boxSize === "number" ? o.boxSize : null;
        this.pnfBox = fixed ?? pnfBoxSize(axis, lastAtrValue(src, o?.atrLength ?? 14));
      }
      bars = axis;
    }
    this.transformText = this.transform ? transformLabel(this.transform, this.settings.symbol?.transform, src) : null;
    this.data.set(bars);
    if (mode === "live" && this.data.length > before && before > 0) this.ts.appendTimes(this.data.times, this.data.length - before);
    else this.ts.setTimes(this.data.times, this.meta.intervalSec);
    if (mode === "reset") {
      this.ts.reset();
      for (const p of this.panes) p.ps.resetAuto();
    }
    this.recompute();
  }

  private recompute(): void {
    this.display = this.chartType === "heikin-ashi" ? heikinAshi(this.data.bars) : (this.data.bars as Bar[]);
    this.studies.invalidate();
    this.indicators.computeAll(this.data.bars as Bar[], false, this.htfProvider, this.meta.intervalSec);
    this.alignCompare();
    this.placeEvents();
    this.alignFlow(false);
    this.events.emit("data", this.data.length);
    this.invalidate();
  }

  private htfProvider = (tf: string): readonly Bar[] | null => this.htf.get(tf) ?? null;

  // ---------- transforms, compare, events, timeframes, script plots ----------

  /** Status text of the active transform for the legend ("Renko · box 2.5"), null when none. */
  transformStatus(): string | null {
    return this.transformText;
  }

  /** Compare symbols (percent overlays); colors come from the caller (theme palette). */
  setCompare(list: { symbol: string; color: string; bars: readonly Bar[]; error?: string }[]): void {
    this.compare = list.map((c) => ({ ...c, aligned: [] }));
    this.alignCompare();
    this.events.emit("data", this.data.length);
    this.invalidate();
  }

  /** Source-bar time of the displayed bar under plot x (clamped to the data). */
  sourceTimeAtX(x: number): number {
    const times = this.sourceTimes();
    const i = Math.max(0, Math.min(times.length - 1, this.ts.xToBar(x)));
    return times[i] ?? 0;
  }

  /** Source time of each displayed bar (transformed elements map back to their completing bar). */
  sourceTimes(): readonly number[] {
    return this.transform ? (this.data.bars as AxisBar[]).map((b) => b.sourceTime) : this.data.times;
  }

  private alignCompare(): void {
    if (!this.compare.length) return;
    const times = this.sourceTimes();
    for (const c of this.compare) c.aligned = alignCloses(times, c.bars);
  }

  private placeEvents(): void {
    // Transformed elements (renko, kagi, ...) carry the time of the source bar that completed
    // them: an event goes to the first element formed in or after its bar.
    this.eventMarkers = placeEventMarkers(this.corpEvents, this.sourceTimes(), this.meta.intervalSec);
  }

  setEvents(events: CorporateEvent[]): void {
    this.corpEvents = events;
    this.placeEvents();
    this.invalidate();
  }

  setShadeExtended(on: boolean): void {
    if (on === this.shadeExtended) return;
    this.shadeExtended = on;
    this.invalidate();
  }

  /** Higher-timeframe bars for multi-timeframe indicators (null removes them). */
  setTimeframeBars(tf: string, bars: readonly Bar[] | null): void {
    if (bars) this.htf.set(tf, bars);
    else this.htf.delete(tf);
    this.indicators.computeAll(this.data.bars as Bar[], false, this.htfProvider, this.meta.intervalSec);
    this.events.emit("data", this.data.length);
    this.invalidate();
  }

  /** Timeframes the indicators ask for (the host loads their bars). */
  wantedTimeframes(): string[] {
    return this.indicators.timeframes();
  }

  /**
   * User-script plots: drawn like indicators (overlay and/or one separate pane), with a legend row
   * and a remove button. `null` (or empty plots) removes them.
   */
  setScriptPlots(plots: ScriptRunResult["plots"] | null, outputs: Record<string, Series> = {}): void {
    this.scriptPlots = plots && plots.length ? { plots, outputs } : null;
    this.scriptItems = this.scriptPlots ? scriptIndicators(this.scriptPlots.plots, this.scriptPlots.outputs, this.instances.length) : [];
    this.indicators.setExternal([...this.scriptItems, ...this.flowItems]);
    this.setIndicators(this.instances);
  }

  /**
   * Order flow data (taker flow per provider bar, footprint bars and their bin size), or null to
   * remove it. What is drawn follows `settings.orderFlow`.
   */
  setOrderFlow(raw: { flow: readonly BarFlow[]; footprints: readonly FootprintBar[]; tick: number } | null): void {
    this.flowRaw = raw;
    this.alignFlow(true);
  }

  /** Groups the order flow into the displayed bars; `panes` also rebuilds the Delta / CVD panes. */
  private alignFlow(panes: boolean): void {
    const raw = this.flowRaw;
    const show = this.settings.orderFlow ?? {};
    // Price-only chart types have no time axis to put trades on.
    const times = raw && !this.transform ? this.data.times : [];
    this.flowFootprints = raw && (show.footprint || show.bubbles) ? groupFootprints(times, raw.footprints) : new Map();
    this.flowTick = raw?.tick ?? 0;
    const delta = raw && (show.delta || show.cvd) ? groupDelta(times, raw.flow) : [];
    const next = raw && times.length ? flowIndicators(delta, show, this.instances.length + this.scriptItems.length) : [];
    const sameSet = next.length === this.flowItems.length && next.every((c, i) => c.uid === this.flowItems[i].uid);
    if (sameSet && !panes) {
      // Same panes: refresh the values in place (live updates, history pages).
      next.forEach((c, i) => (this.flowItems[i].series = c.series));
      return;
    }
    this.flowItems = next;
    this.indicators.setExternal([...this.scriptItems, ...this.flowItems]);
    if (panes || !sameSet) this.setIndicators(this.instances);
  }

  /** Removes the script plots and tells the host (legend remove button). */
  removeScriptPlots(): void {
    this.setScriptPlots(null);
    this.events.emit("scriptPlotsRemoved", null);
  }

  /** Cached result of a study for the current bars. */
  studyResult(c: ComputedIndicator): StudyResult {
    return this.studies.get(c, this.data.bars as Bar[], this.meta.intervalSec);
  }

  // ---------- paper trading lines ----------

  setTradeLines(lines: TradeLine[]): void {
    // Keep a dragged line's preview until the drag ends.
    this.tradeLines = lines;
    this.invalidate();
  }

  /** Trade line part under main-pane coordinates (x in plot px, y relative to the pane top). */
  tradeLineAt(x: number, y: number): { line: TradeLine; part: "close" | "label" | "line" } | null {
    if (!this.tradeLines.length) return null;
    return tradeLineHit(this.ui.ctx, this.theme, this.tradeLines, (p) => this.mainPane.ps.toY(p), x, y);
  }

  // ---------- bar replay ----------

  /** Applies a replay action; reveals/hides bars and drives the play timer. */
  replayDispatch(a: ReplayAction): void {
    const prev = this.replay;
    const next = replayReducer(prev, a);
    if (next === prev) return;
    this.replay = next;
    if (prev.cursor !== next.cursor || prev.phase !== next.phase || (prev.ticks && !next.ticks)) {
      // A new cursor (or leaving tick mode) drops the bar that was forming.
      this.tickPlay = null;
      this.replayForming = null;
      const forward = prev.phase === "on" && next.phase === "on" && (next.cursor ?? 0) > (prev.cursor ?? 0);
      this.rebuild(forward ? "live" : "set");
    }
    if (prev.phase !== "on" && next.phase === "on") {
      // Leave room on the right for the bars to come.
      this.ts.rightOffset = Math.max(this.ts.rightOffset, this.ts.visibleBarCount() * 0.25);
      this.ts.scrollBars(0);
    }
    this.syncReplayTimer(prev);
    this.events.emit("replay", next);
    this.invalidate();
  }

  /** Times of the full source series (replay steps walk these). */
  replayTimes(): readonly number[] {
    return this.raw.times;
  }

  private syncReplayTimer(prev: ReplayState): void {
    const r = this.replay;
    const running = r.phase === "on" && r.playing;
    const ticks = Boolean(r.ticks && this.tickSource);
    if (running && this.replayTimer && prev.playing && prev.speed === r.speed && Boolean(prev.ticks) === Boolean(r.ticks)) return;
    window.clearInterval(this.replayTimer);
    this.replayTimer = 0;
    if (!running) return;
    if (ticks) this.replayTimer = window.setInterval(this.tickFrame, TICK_FRAME_MS);
    else this.replayTimer = window.setInterval(() => this.replayDispatch({ type: "step", times: this.raw.times }), 1000 / r.speed);
  }

  private setTickNote(note: string | null): void {
    if (note === this.tickNote) return;
    this.tickNote = note;
    this.events.emit("replay", this.replay);
  }

  /** Tick replay frame: load the next bar's ticks, then reveal them a few at a time. */
  private tickFrame = (): void => {
    const r = this.replay;
    if (r.phase !== "on" || r.cursor == null || this.tickLoading) return;
    const times = this.raw.times;
    if (!this.tickPlay) {
      const k = countAtOrBefore(times, r.cursor);
      const time = times[k];
      if (time === undefined) return this.replayDispatch({ type: "pause" });
      const end = times[k + 1] ?? time + this.meta.intervalSec;
      const source = this.tickSource;
      if (!source) return this.replayDispatch({ type: "step", times });
      this.tickLoading = true;
      this.setTickNote("Loading ticks…");
      source(time, end)
        .then((ticks) => {
          if (this.replay.cursor !== r.cursor || this.replay.phase !== "on") return;
          if (!ticks.length) {
            // No recorded ticks for this bar: reveal it whole and go on.
            this.setTickNote("No ticks for this bar");
            this.replayDispatch({ type: "step", times: this.raw.times });
            return;
          }
          this.setTickNote(null);
          this.tickPlay = { time, ticks, shown: 0 };
        })
        .catch((e: unknown) => {
          this.setTickNote(`Ticks unavailable: ${e instanceof Error ? e.message : String(e)}`);
          this.replayDispatch({ type: "pause" });
        })
        .finally(() => (this.tickLoading = false));
      return;
    }
    const p = this.tickPlay;
    p.shown = Math.min(p.ticks.length, p.shown + tickStep(p.ticks.length, r.speed));
    if (p.shown >= p.ticks.length) {
      // The bar is complete: reveal the real bar (this also clears the forming one).
      this.replayDispatch({ type: "step", times });
      return;
    }
    this.replayForming = formingBar(p.ticks, p.shown, p.time);
    this.rebuild("live");
  };

  /** Time and close of the last revealed source bar (replay fills), null without data. */
  replayPrice(): { time: number; close: number } | null {
    const src = revealBars(this.raw.bars, this.replay);
    const b = src[src.length - 1];
    return b ? { time: b.time, close: b.close } : null;
  }

  setReplayMarkers(m: TradeMarker[]): void {
    this.replayMarkers = m;
    this.invalidate();
  }

  // ---------- appearance ----------

  setTheme(mode: ThemeMode): void {
    this.themeMode = mode;
    this.theme = chartTheme(mode, this.settings);
    this.invalidate();
  }

  setChartSettings(cs: ChartSettings | undefined): void {
    const prevPlacement = this.settings.scales?.placement;
    const prevTransform = JSON.stringify(this.settings.symbol?.transform ?? null);
    const prevFlow = JSON.stringify(this.settings.orderFlow ?? null);
    this.settings = cs ?? {};
    if (JSON.stringify(this.settings.orderFlow ?? null) !== prevFlow) this.alignFlow(true);
    if (this.transform && JSON.stringify(this.settings.symbol?.transform ?? null) !== prevTransform) this.rebuild("reset");
    this.theme = chartTheme(this.themeMode, this.settings);
    const sc = this.settings.scales;
    if (!sc?.percent && !sc?.indexed) this.mainPane.ps.percentBase = null;
    this.mainPane.ps.indexed = sc?.indexed === true;
    this.mainPane.ps.inverted = sc?.inverted === true;
    if (prevPlacement !== this.settings.scales?.placement) this.layoutDirty = true;
    this.invalidate();
  }

  /** Auto-fit on/off for one pane's price scale (off keeps the current range). */
  setAutoScale(paneIndex: number, on: boolean): void {
    const ps = this.panes[paneIndex]?.ps;
    if (!ps) return;
    if (on) ps.resetAuto();
    else ps.auto = false;
    this.invalidate();
  }

  resetPriceScale(paneIndex: number): void {
    this.panes[paneIndex]?.ps.resetAuto();
    this.invalidate();
  }

  /** Whether an indicator is drawn on the current interval. */
  indicatorShown(c: ComputedIndicator): boolean {
    return c.visible && (!this.meta.interval || visibleOnInterval(c.visibility, this.meta.interval));
  }

  /** Whether a drawing is drawn (and hit-testable) on the current interval. */
  drawingShown(d: Drawing): boolean {
    return drawingVisible(d, this.meta.interval ? this.meta.intervalSec : null, this.drawings.hideAll);
  }

  setChartType(t: ChartType): void {
    if (t === this.chartType) return;
    this.chartType = t;
    const kind = transformOf(t);
    if (kind !== this.transform) {
      // Switching between time and element axes: rebuild the series and restore the default view.
      this.transform = kind;
      this.rebuild("reset");
      return;
    }
    this.display = t === "heikin-ashi" ? heikinAshi(this.data.bars) : (this.data.bars as Bar[]);
    this.invalidate();
  }

  setLogScale(log: boolean): void {
    this.mainPane.ps.setLog(log);
    this.mainPane.ps.resetAuto();
    this.invalidate();
  }

  setShowVolume(v: boolean): void {
    this.showVolume = v;
    this.invalidate();
  }

  setMarkers(markers: TradeMarker[]): void {
    this.markers = markers;
    this.invalidate();
  }

  setIndicators(instances: IndicatorInstance[]): void {
    this.instances = instances;
    this.indicators.setInstances(instances);
    this.indicators.computeAll(this.data.bars as Bar[], true, this.htfProvider, this.meta.intervalSec);
    this.studies.retain(new Set(this.indicators.items.map((c) => c.uid)));
    // One pane per separate indicator, or the pane of the indicator named by `paneWith`; keep
    // existing panes (ratios, scale state, collapsed).
    const old = new Map(this.panes.map((p) => [p.id, p]));
    const next: Pane[] = [this.mainPane];
    this.mainPane.uids = this.indicators.overlays().map((c) => c.uid);
    const separates = this.indicators.separates();
    const rootOf = paneRoots(separates);
    const byRoot = new Map<string, Pane>();
    for (const c of separates) {
      if (rootOf.get(c.uid) !== c.uid) continue;
      const id = `pane-${c.uid}`;
      const pane = old.get(id) ?? new Pane(id, false, this.storedRatios[c.uid] ?? DEFAULT_PANE_RATIO);
      pane.uids = [];
      byRoot.set(c.uid, pane);
      next.push(pane);
    }
    for (const c of separates) byRoot.get(rootOf.get(c.uid)!)!.uids.push(c.uid);
    // The pane's own indicator comes first (it names the pane and keys its height).
    for (const [root, pane] of byRoot) pane.uids.sort((x, y) => (x === root ? -1 : y === root ? 1 : 0));
    for (const uid of [...this.ownScales.keys()]) if (this.indicators.get(uid)?.scale !== "own") this.ownScales.delete(uid);
    if (this.maximizedPane && !next.some((p) => p.id === this.maximizedPane)) this.maximizedPane = null;
    const changed = next.length !== this.panes.length || next.some((p, i) => p !== this.panes[i]);
    this.panes = next;
    if (changed) this.layoutDirty = true;
    this.events.emit("data", this.data.length);
    this.invalidate();
  }

  /** Restore saved pane heights (keys: "main" or indicator uid). */
  setPaneRatios(ratios: Record<string, number> | undefined): void {
    this.storedRatios = { ...(ratios ?? {}) };
    let changed = false;
    for (const p of this.panes) {
      const r = this.storedRatios[p.main ? "main" : p.uids[0]] ?? (p.main ? 1 : DEFAULT_PANE_RATIO);
      if (Math.abs(p.ratio - r) > 1e-9) {
        p.ratio = r;
        changed = true;
      }
    }
    if (changed) this.invalidateLayout();
  }

  /** Current pane heights as ratios keyed by "main" / indicator uid. */
  paneRatios(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of this.panes) out[p.main ? "main" : p.uids[0]] = Math.round(p.ratio * 1e4) / 1e4;
    return out;
  }

  /** Maximise pane `index` (hide the others), or restore all panes when it is already maximised. */
  togglePaneMaximized(index: number): void {
    const pane = this.panes[index];
    if (!pane) return;
    this.maximizedPane = this.maximizedPane === pane.id || this.panes.length < 2 ? null : pane.id;
    this.invalidateLayout();
  }

  /** Collapse an indicator pane to its legend row, or expand it again. The price pane never collapses. */
  togglePaneCollapsed(index: number): void {
    const pane = this.panes[index];
    if (!pane || pane.main) return;
    pane.collapsed = !pane.collapsed;
    if (pane.collapsed && this.maximizedPane === pane.id) this.maximizedPane = null;
    this.invalidateLayout();
  }

  /** Scale an indicator's values are drawn on: its own hidden scale, else its pane's scale. */
  scaleFor(uid: string, pane: Pane): PriceScale {
    return this.ownScales.get(uid) ?? pane.ps;
  }

  /** Called by the interaction layer when a separator drag ends. */
  commitPaneRatios(): void {
    this.storedRatios = this.paneRatios();
    this.events.emit("paneRatios", this.storedRatios);
  }

  // ---------- drawings ----------

  setDrawings(list: Drawing[]): void {
    this.drawings.setDrawings(list);
  }
  setTool(tool: Tool): void {
    this.drawings.setTool(tool);
  }
  setMagnet(on: boolean): void {
    this.drawings.setMagnet(on);
  }
  setDrawingText(id: string, text: string): void {
    this.drawings.setText(id, text);
  }
  removeAllDrawings(): void {
    this.drawings.removeAll();
  }
  /** Replace one drawing (settings dialog, floating toolbar); emits the drawings change. */
  updateDrawing(id: string, fn: (d: Drawing) => Drawing): void {
    this.drawings.update(id, fn);
  }
  /** Adds finished drawings (study conversion); emits the drawings change. */
  addDrawings(list: Drawing[]): void {
    this.drawings.add(list);
  }
  cloneDrawing(id: string): void {
    this.drawings.clone(id);
  }
  reorderDrawing(id: string, where: "front" | "back"): void {
    this.drawings.reorder(id, where);
  }
  removeDrawing(id: string): void {
    this.drawings.remove(id);
  }
  selectDrawing(id: string | null): void {
    this.drawings.selectId(id);
  }

  // ---------- hit-testing for context menus ----------

  /** Indicator whose visible plotted output passes within `tol` px of (x, y) in pane `paneIndex`. */
  indicatorAt(paneIndex: number, x: number, y: number, tol = 5): string | null {
    const pane = this.panes[paneIndex];
    if (!pane || this.data.length === 0) return null;
    const i = Math.round(this.ts.xToBar(x));
    const ly = y - pane.top;
    for (const uid of [...pane.uids].reverse()) {
      const c = this.indicators.get(uid);
      if (!c || !this.indicatorShown(c)) continue;
      if (pane.main && studyHit(this, c, x, ly, tol)) return uid;
      const ps = this.scaleFor(uid, pane);
      for (let j = 0; j < c.def.outputs.length; j++) {
        const out = c.def.outputs[j];
        if (!outputStyle(this.theme, c, j, out).visible) continue;
        const s = c.series[out.key];
        if (!s) continue;
        if (out.style === "histogram") {
          const v = s[i];
          if (v == null) continue;
          const y0 = ps.toY(0);
          const yv = ps.toY(v);
          if (Math.abs(this.ts.indexToX(i) - x) <= Math.max(tol, this.ts.barSpacing / 2) && ly >= Math.min(y0, yv) - tol && ly <= Math.max(y0, yv) + tol) return uid;
          continue;
        }
        for (const k of [i - 1, i]) {
          const a = s[k];
          const b = s[k + 1];
          if (a == null || b == null || !isFinite(a) || !isFinite(b)) continue;
          const d = distanceToSegment(x, ly, this.ts.indexToX(k), ps.toY(a), this.ts.indexToX(k + 1), ps.toY(b));
          if (d <= tol) return uid;
        }
      }
    }
    return null;
  }

  /** Classify a point in plot coordinates (x relative to the plot's left edge). */
  contextTarget(x: number, y: number): ContextTarget | null {
    if (y > this.plotHeight) return null;
    const paneIndex = this.panes.findIndex((p) => p.contains(y));
    if (paneIndex < 0) return null;
    if (x < 0 || x > this.plotWidth) return { kind: "priceAxis", pane: paneIndex };
    const pane = this.panes[paneIndex];
    if (paneIndex === 0 && this.data.length > 0) {
      const hit = this.drawings.hitTest(x, y - pane.top);
      if (hit) return { kind: "drawing", id: hit.id };
    }
    const ind = this.indicatorAt(paneIndex, x, y);
    if (ind) return { kind: "indicator", uid: ind };
    const time = this.data.length ? this.ts.indexToTime(this.ts.xToBar(x)) : 0;
    return { kind: "chart", pane: paneIndex, price: pane.ps.fromY(y - pane.top), time };
  }

  /** Data-space anchor to main-pane pixel coordinates. */
  toPx(a: Anchor): { x: number; y: number } {
    return { x: this.ts.timeToX(a.time), y: this.mainPane.ps.toY(a.price) };
  }

  /** Main-pane pixel to data-space anchor; time snaps to the nearest bar slot. */
  toData(p: { x: number; y: number }): Anchor {
    return { time: this.ts.indexToTime(this.ts.xToBar(p.x)), price: this.mainPane.ps.fromY(p.y) };
  }

  // ---------- view ----------

  resetView(): void {
    this.ts.reset();
    for (const p of this.panes) p.ps.resetAuto();
    this.userViewChanged();
  }

  /** Scroll so the bar at `time` sits in the middle of the plot. */
  scrollToTime(time: number): void {
    const i = this.ts.timeToIndex(time);
    const half = this.ts.visibleBarCount() / 2;
    this.ts.rightOffset = i + half - this.ts.lastIndex - 0.5;
    this.ts.scrollBars(0);
    this.userViewChanged();
  }

  /** The time axis was moved by the user: report the visible range after the next frame. */
  userViewChanged(): void {
    this.viewNotify = true;
    this.invalidate();
  }

  /** Visible time range (UTC seconds at the plot's left and right edges), null without data. */
  visibleTimeRange(): { from: number; to: number } | null {
    if (this.data.length === 0 || this.plotWidth <= 0) return null;
    return { from: this.ts.xToTime(0), to: this.ts.xToTime(this.plotWidth) };
  }

  /** Show a time range (from a linked chart). Does not report a view change back. */
  setVisibleTimeRange(from: number, to: number): void {
    if (this.data.length === 0 || !(to > from)) return;
    this.ts.setVisibleRange(this.ts.timeToIndex(from), this.ts.timeToIndex(to));
    this.invalidate();
  }

  /**
   * Draw a vertical crosshair at `time` mirrored from another chart (null clears it). Only the
   * UI layer repaints; the scales never move. The local pointer crosshair takes precedence.
   */
  setExternalCrosshair(time: number | null): void {
    if (time === this.externalCrosshair) return;
    this.externalCrosshair = time;
    this.invalidate(false);
  }

  /** Renderer callback: x of the drawn vertical crosshair, exposed as data-crosshair-x. */
  markCrosshair(x: number | null): void {
    const v = x == null ? null : Math.round(x);
    if (v === this.crosshairX) return;
    this.crosshairX = v;
    if (v == null) delete this.root.dataset.crosshairX;
    else this.root.dataset.crosshairX = String(v);
  }

  focus(): void {
    this.root.focus({ preventScroll: true });
  }

  /** Bar index under the crosshair, or null when not hovering the plot. */
  hoverIndex(): number | null {
    if (!this.hover || this.data.length === 0) return null;
    if (this.hover.x < 0 || this.hover.x > this.plotWidth || this.hover.y > this.plotHeight) return null;
    const i = this.ts.xToBar(this.hover.x);
    return Math.max(0, Math.min(this.data.length - 1, i));
  }

  legend(index: number | null): LegendData | null {
    return buildLegend(this, index);
  }

  paneInfos(): PaneInfo[] {
    return this.panes.map((p) => ({ id: p.id, main: p.main, top: p.top, height: p.height, uids: [...p.uids], collapsed: p.collapsed, maximized: p.id === this.maximizedPane }));
  }

  // ---------- rendering ----------

  invalidate(sceneToo = true): void {
    if (sceneToo) this.sceneDirty = true;
    this.uiDirty = true;
    if (!this.raf && !this.destroyed) this.raf = requestAnimationFrame(this.frame);
  }

  invalidateLayout(): void {
    this.layoutDirty = true;
    this.invalidate();
  }

  private applyLayout(): void {
    const t = this.theme;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    this.width = w;
    this.height = h;
    this.plotWidth = Math.max(0, w - t.priceAxisWidth);
    this.plotLeft = this.settings.scales?.placement === "left" ? t.priceAxisWidth : 0;
    this.plotHeight = Math.max(0, h - t.timeAxisHeight);
    this.scene.resize(w, h, dpr);
    this.ui.resize(w, h, dpr);
    this.ts.setWidth(this.plotWidth);
    for (const p of this.panes) p.hidden = this.maximizedPane != null && p.id !== this.maximizedPane;
    layoutPanes(this.panes, this.plotHeight, t.separatorHeight);
    this.events.emit("layout", this.paneInfos());
  }

  private frame = (): void => {
    this.raf = 0;
    if (this.destroyed) return;
    if (this.layoutDirty) {
      this.layoutDirty = false;
      this.applyLayout();
      this.sceneDirty = true;
    }
    if (this.sceneDirty) {
      this.sceneDirty = false;
      fitScales(this);
      renderScene(this);
      this.checkHistory();
      this.events.emit("rendered", this.data.length);
    }
    if (this.uiDirty) {
      this.uiDirty = false;
      renderUi(this);
    }
    const hi = this.hoverIndex();
    if (hi !== this.lastHoverIndex) {
      this.lastHoverIndex = hi;
      this.events.emit("hover", hi);
    }
    if (this.viewNotify) {
      this.viewNotify = false;
      const r = this.visibleTimeRange();
      if (r) this.events.emit("viewChange", r);
    }
  };

  private checkHistory(): void {
    if (this.data.length === 0 || this.historyRequestedAt !== null) return;
    // Price-only chart types have few elements per source bar: stop paging at a sane depth.
    if (this.transform && this.raw.length >= MAX_TRANSFORM_SOURCE_BARS) return;
    if (this.ts.leftIndex() < 50) {
      this.historyRequestedAt = this.data.bars[0].time;
      this.events.emit("needHistory", this.historyRequestedAt);
    }
  }

  destroy(): void {
    this.destroyed = true;
    window.clearInterval(this.replayTimer);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.interaction.destroy();
    this.events.clear();
    this.scene.destroy();
    this.ui.destroy();
  }
}
