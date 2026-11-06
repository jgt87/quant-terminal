// Hosts the canvas chart engine and its DOM overlays (legends, floating drawing toolbar).

import { useEffect, useMemo, useRef, useState } from "react";
import { allAnchors, type ChartSettings, type ChartType, type Drawing, type IndicatorInstance, type Interval, type SymbolInfo } from "@qt/core";
import { ChartEngine, type ContextTarget, type PaneInfo } from "../chart/ChartEngine";
import type { Tool } from "../chart/drawings/DrawingController";
import { applyTick, isLiveSymbol, tickPrice } from "../chart/liveTick";
import type { ThemeMode } from "../chart/theme";
import type { EventMarker } from "../chart/events";
import { REPLAY_OFF, type ReplayState } from "../chart/replay";
import { isScriptUid } from "../chart/scriptPlots";
import { flowPaneOf } from "../chart/orderFlow";
import { transformOf } from "../chart/transform";
import { useOrderFlow } from "../hooks/useOrderFlow";
import { useChartTrading } from "../hooks/useChartTrading";
import { fetchTicks } from "../api/orderflow";
import { useChartData } from "../hooks/useChartData";
import { useCompareSeries, useCorporateEvents, useTimeframeBars } from "../hooks/useChartExtras";
import { useTickStream } from "../hooks/useTickStream";
import { displayInterval } from "../data/intervalSpec";
import { ChartTips } from "./ChartTips";
import { ValuesTooltip } from "./ValuesTooltip";
import { InlineTextEditor } from "./InlineTextEditor";
import { setField } from "../chart/drawings/schema";
import type { InlineTextEdit } from "../chart/drawings/types";
import { DrawingFloatBar, floatBarPinned, onFloatBarPin } from "./DrawingFloatBar";
import { loadTemplates } from "../chart/drawings/templateStore";
import { setDrawingPrefs, useDrawingPrefs } from "../state/drawingPrefs";
import type { MenuItem } from "./menuTypes";
import { CompareLegend, IndicatorLegend, MainLegend } from "./Legend";
import { ReplayBar } from "./replay/ReplayBar";
import "../styles/chart.css";

export interface ChartViewProps {
  symbol: string;
  interval: Interval;
  /** Custom interval ("2h", "3D") resampled from `interval`. */
  customInterval?: string;
  /** Compare symbols drawn as percent overlays. */
  compare?: string[];
  onRemoveCompare?(symbol: string): void;
  chartType: ChartType;
  logScale: boolean;
  showVolume: boolean;
  indicators: IndicatorInstance[];
  paneRatios?: Record<string, number>;
  chartSettings?: ChartSettings;
  theme: ThemeMode;
  drawings: Drawing[];
  onEngine(engine: ChartEngine | null): void;
  onInfo(info: SymbolInfo | null): void;
  onDrawingsChange(list: Drawing[]): void;
  onPaneRatios(ratios: Record<string, number>): void;
  onToolChange(tool: Tool): void;
  onTextRequest(id: string, text: string): void;
  onTypeToSearch(ch: string): void;
  onRemoveIndicator(uid: string): void;
  /** Switch order flow parts on or off (the Delta / CVD legend remove buttons). */
  onOrderFlow?(patch: NonNullable<ChartSettings["orderFlow"]>): void;
  onEditIndicator(uid: string): void;
  onToggleIndicator(uid: string): void;
  onContextMenu(target: ContextTarget, clientX: number, clientY: number): void;
  onDrawingSettings(id: string): void;
  /** "Add alert on this drawing" from the floating toolbar. */
  onDrawingAlert?(id: string): void;
  /** Alt+A on the chart: an alert on the selected drawing, else at the cursor price. */
  onAlertAt?(price: number): void;
  /** Template ▸ / More ▸ of the floating toolbar: menu items for the selected drawing. */
  drawingMenu?(kind: "template" | "more", id: string): MenuItem[] | null;
  /** Opens a menu at client coordinates (floating toolbar submenus). */
  onOpenMenu?(x: number, y: number, items: MenuItem[]): void;
  /** Focus the chart when it mounts (the active cell); defaults to true. */
  autoFocus?: boolean;
}

const BAR_W = 300;

export function ChartView(p: ChartViewProps) {
  const host = useRef<HTMLDivElement>(null);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [panes, setPanes] = useState<PaneInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [barPos, setBarPos] = useState<{ x: number; y: number } | null>(null);
  const [replay, setReplay] = useState<ReplayState>(REPLAY_OFF);
  const [eventTip, setEventTip] = useState<{ marker: EventMarker; x: number; y: number } | null>(null);
  const [, setVersion] = useState(0);
  const cb = useRef(p);
  cb.current = p;

  useEffect(() => {
    const e = new ChartEngine(host.current!);
    const offs = [
      e.events.on("hover", setHover),
      e.events.on("layout", setPanes),
      e.events.on("data", () => setVersion((v) => v + 1)),
      e.events.on("drawings", (l) => cb.current.onDrawingsChange(l)),
      e.events.on("paneRatios", (r) => cb.current.onPaneRatios(r)),
      e.events.on("tool", (t) => cb.current.onToolChange(t)),
      e.events.on("textRequest", (r) => cb.current.onTextRequest(r.id, r.text)),
      e.events.on("typeToSearch", (ch) => cb.current.onTypeToSearch(ch)),
      e.events.on("selection", setSelected),
      e.events.on("contextMenu", (m) => cb.current.onContextMenu(m.target, m.clientX, m.clientY)),
      e.events.on("replay", setReplay),
      e.events.on("eventHover", setEventTip),
    ];
    setEngine(e);
    cb.current.onEngine(e);
    if (cb.current.autoFocus !== false) e.focus();
    return () => {
      offs.forEach((off) => off());
      cb.current.onEngine(null);
      e.destroy();
    };
  }, []);

  const sym = p.chartSettings?.symbol;
  const barOpts = useMemo(
    () => ({ adjust: sym?.adjustDividends ? ("dividends" as const) : undefined, session: sym?.extendedHours ? ("extended" as const) : undefined }),
    [sym?.adjustDividends, sym?.extendedHours],
  );
  const data = useChartData(engine, p.symbol, p.interval, p.customInterval, barOpts);

  useEffect(() => cb.current.onInfo(data.info), [data.info]);

  // Compare overlays, higher timeframes for multi-timeframe indicators, corporate events.
  const palette = engine?.theme.comparePalette ?? [];
  useCompareSeries(engine, p.compare, p.interval, p.customInterval, barOpts, palette);
  const timeframes = useMemo(() => p.indicators.map((i) => i.timeframe ?? "").filter(Boolean), [p.indicators]);
  useTimeframeBars(engine, p.symbol, timeframes, barOpts);
  useCorporateEvents(engine, p.symbol);
  useChartTrading(engine, p.symbol);
  // Tick replay needs recorded ticks: Binance trades or MT5 ticks.
  const tickProvider = data.info?.provider === "binance" || data.info?.provider === "mt5";
  useEffect(() => {
    if (!engine) return;
    engine.tickSource = tickProvider ? (from, to) => fetchTicks(p.symbol, from, to).then((r) => r.ticks) : null;
    if (!tickProvider && engine.replay.ticks) engine.replayDispatch({ type: "ticks", on: false });
  }, [engine, tickProvider, p.symbol]);
  useOrderFlow(engine, p.symbol, p.interval, p.chartSettings?.orderFlow, data.info?.provider, data.status === "ready", transformOf(p.chartType) != null);
  const intradayData = (engine?.meta.intervalSec ?? 86400) < 86400;
  const stockLike = data.info?.type === "stock" || data.info?.type === "etf";
  useEffect(() => engine?.setShadeExtended(Boolean(sym?.extendedHours) && intradayData && stockLike), [engine, sym?.extendedHours, intradayData, stockLike]);

  // Live ticks for MT5-served symbols: fold each tick into the last bar (polling still resyncs).
  const live = data.status === "ready" && data.plain && isLiveSymbol(p.symbol, data.info?.provider);
  const stream = useTickStream(live ? [p.symbol] : [], (t) => {
    // The chart stream carries only this symbol (aliases such as EURUSD=X arrive as MT5:EURUSD).
    if (!engine || engine.meta.symbol !== p.symbol) return;
    const r = applyTick(engine.lastSourceBar(), tickPrice(t), t.time, p.interval);
    if (r) engine.upsertBar(r.bar);
  });

  useEffect(() => engine?.setTheme(p.theme), [engine, p.theme]);
  useEffect(() => engine?.setChartSettings(p.chartSettings), [engine, p.chartSettings]);
  useEffect(() => engine?.setChartType(p.chartType), [engine, p.chartType]);
  useEffect(() => engine?.setLogScale(p.logScale), [engine, p.logScale]);
  useEffect(() => engine?.setShowVolume(p.showVolume), [engine, p.showVolume]);
  useEffect(() => {
    engine?.setPaneRatios(p.paneRatios);
    engine?.setIndicators(p.indicators);
  }, [engine, p.indicators, p.paneRatios]);
  // Drawing preferences (magnet, lock/hide all, stay in drawing mode, cursor) apply to every chart.
  const dp = useDrawingPrefs();
  useEffect(() => {
    if (!engine) return;
    engine.drawings.setMagnet(dp.magnet);
    engine.drawings.setFlags({ lockAll: dp.lockAll, hideAll: dp.hideAll, stayInDrawingMode: dp.stayInDrawingMode, cursorStyle: dp.cursor });
  }, [engine, dp.magnet, dp.lockAll, dp.hideAll, dp.stayInDrawingMode, dp.cursor]);
  useEffect(() => {
    void loadTemplates();
  }, []);
  useEffect(
    () =>
      engine?.drawings.events.on("command", (c) => {
        if (c.kind === "hideAll") setDrawingPrefs((pr) => ({ hideAll: !pr.hideAll }));
        else if (c.drawingId) cb.current.onDrawingAlert?.(c.drawingId);
        else if (c.price !== undefined) cb.current.onAlertAt?.(c.price);
      }),
    [engine],
  );

  // Drawings are swapped per symbol (each symbol has its own undo history); while on one
  // symbol the engine is the source of truth.
  const drawingsRef = useRef(p.drawings);
  drawingsRef.current = p.drawings;
  useEffect(() => engine?.drawings.setDrawings(drawingsRef.current, p.symbol), [engine, p.symbol]);

  // The floating toolbar sits over the selected drawing (single selection), or where the user
  // dragged it (remembered for the session).
  const [inline, setInline] = useState<{ id: string; edit: InlineTextEdit } | null>(null);
  // Opened after the current pointer press has finished (the press would move focus to the chart).
  useEffect(() => engine?.drawings.events.on("inlineEdit", (r) => void setTimeout(() => setInline(r), 0)), [engine]);
  const [selCount, setSelCount] = useState(0);
  const multi = selCount > 1;
  useEffect(() => engine?.drawings.events.on("selection", (ids) => setSelCount(ids.length)), [engine]);
  useEffect(() => {
    if (!engine || !selected || multi) {
      setBarPos(null);
      return;
    }
    const place = () => {
      const d = engine.drawings.drawings.find((k) => k.id === selected);
      if (!d || engine.drawings.busy) {
        setBarPos((old) => (old === null ? old : null));
        return;
      }
      const pinned = floatBarPinned();
      if (pinned) {
        const x = Math.max(0, Math.min(engine.width - BAR_W, pinned.x));
        const y = Math.max(0, Math.min(engine.height - 40, pinned.y));
        setBarPos((old) => (old && old.x === x && old.y === y ? old : { x, y }));
        return;
      }
      const pts = allAnchors(d).map((a) => engine.toPx(a));
      if (!pts.length) return;
      const top = Math.min(...pts.map((q) => q.y)) + engine.mainPane.top;
      const cx = pts.reduce((s, q) => s + q.x, 0) / pts.length;
      const x = Math.max(4, Math.min(engine.plotWidth - BAR_W - 4, cx - BAR_W / 2)) + engine.plotLeft;
      const y = Math.max(4, Math.min(engine.mainPane.height - 40, top - 46));
      setBarPos((old) => (old && Math.abs(old.x - x) < 0.5 && Math.abs(old.y - y) < 0.5 ? old : { x, y }));
    };
    place();
    const offs = [engine.events.on("rendered", place), engine.events.on("drawings", place), onFloatBarPin(place)];
    return () => offs.forEach((off) => off());
  }, [engine, selected, multi]);

  const legend = engine?.legend(hover) ?? null;
  const shownInterval = displayInterval(p.interval, p.customInterval);
  const intraday = (engine?.meta.intervalSec ?? 86400) < 86400;
  const status = p.chartSettings?.statusLine;
  const selDrawing = selected ? engine?.drawings.drawings.find((d) => d.id === selected) : undefined;
  const legendLeft = (engine?.plotLeft ?? 0) + 8;

  return (
    <div
      className="chart-view"
      data-stream={stream}
      data-last-close={engine?.lastSourceBar()?.close ?? ""}
      data-chart-type={p.chartType}
      data-bars={engine?.data.length ?? 0}
      data-replay={replay.phase}
      data-selected-drawings={selCount}
    >
      <div ref={host} className="chart-host" aria-label="Price chart" />
      <div className="chart-overlay">
        {panes.filter((pane) => pane.height > 0).map((pane) => (
          <div key={pane.id} className={`pane-legend${pane.collapsed ? " collapsed" : ""}`} style={{ top: pane.top + (pane.collapsed ? 3 : 6), left: legendLeft }}>
            {pane.main && (
              <MainLegend
                symbol={p.symbol}
                info={data.info}
                interval={shownInterval}
                legend={legend}
                intraday={intraday}
                decimals={engine?.mainPane.ps.formatDecimals(legend?.bar.close ?? 1) ?? 2}
                loading={data.status === "loading" || data.loadingHistory}
                show={{ ohlc: status?.ohlc !== false, change: status?.change !== false, volume: status?.volume !== false }}
              />
            )}
            {pane.main &&
              legend?.compare.map((c) => <CompareLegend key={c.symbol} item={c} onRemove={() => p.onRemoveCompare?.(c.symbol)} />)}
            {legend?.indicators
              .filter((ind) => ind.paneId === pane.id)
              .map((ind) => (
                <IndicatorLegend
                  key={ind.uid}
                  item={ind}
                  showValues={status?.indicatorValues !== false}
                  format={(v) => {
                    const ep = engine?.panes.find((x) => x.id === pane.id);
                    return engine && ep ? engine.scaleFor(ind.uid, ep).format(v) : String(v);
                  }}
                  onRemove={() => {
                    const flow = flowPaneOf(ind.uid);
                    if (flow) p.onOrderFlow?.({ [flow]: false });
                    else if (isScriptUid(ind.uid)) engine?.removeScriptPlots();
                    else p.onRemoveIndicator(ind.uid);
                  }}
                  onEdit={() => p.onEditIndicator(ind.uid)}
                  onToggle={() => p.onToggleIndicator(ind.uid)}
                  onContextMenu={(x, y) => p.onContextMenu({ kind: "indicator", uid: ind.uid }, x, y)}
                />
              ))}
          </div>
        ))}
        {engine && <ChartTips engine={engine} hover={hover} event={eventTip} />}
        {engine && <ValuesTooltip engine={engine} enabled={dp.valuesTooltip} />}
        {engine && inline && (
          <InlineTextEditor
            key={inline.id + inline.edit.key}
            left={inline.edit.rect.x + engine.plotLeft}
            top={inline.edit.rect.y + engine.mainPane.top}
            width={inline.edit.rect.width}
            height={inline.edit.rect.height}
            value={inline.edit.value}
            multiline={inline.edit.multiline !== false}
            fontSize={inline.edit.fontSize}
            color={inline.edit.color}
            onCommit={(text) => {
              const e = inline.edit;
              engine.drawings.update(inline.id, (d) => (e.apply ? e.apply(d, text) : setField(d, e.key, text)));
              setInline(null);
              engine.focus();
            }}
            onCancel={() => {
              setInline(null);
              engine.focus();
            }}
          />
        )}
        {engine && replay.phase !== "off" && <ReplayBar engine={engine} state={replay} />}
        {engine && selDrawing && barPos && (
          <DrawingFloatBar
            drawing={selDrawing}
            x={barPos.x}
            y={barPos.y}
            theme={engine.theme}
            geom={engine.drawings.geom()}
            lockedAll={dp.lockAll}
            onChange={(fn, mergeKey) => engine.drawings.update(selDrawing.id, fn, mergeKey)}
            onSettings={() => p.onDrawingSettings(selDrawing.id)}
            onRemove={() => engine.removeDrawing(selDrawing.id)}
            onAlert={p.onDrawingAlert ? () => p.onDrawingAlert?.(selDrawing.id) : undefined}
            onMenu={(kind, x, y) => {
              const items = p.drawingMenu?.(kind, selDrawing.id);
              if (items) p.onOpenMenu?.(x, y, items);
            }}
          />
        )}
      </div>
    </div>
  );
}
