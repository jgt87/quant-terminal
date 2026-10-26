// One chart of a grid: an independent chart bound to its own layout id. It registers itself in
// the cell hub (for link groups and sync), reports its state to the shell while it is the active
// cell, and routes every layout change through the link-aware update.

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Drawing, IndicatorInstance, Layout, LinkColor, LinkGroup, SymbolInfo } from "@qt/core";
import type { ChartEngine, ContextTarget } from "../../chart/ChartEngine";
import type { Tool } from "../../chart/drawings/DrawingController";
import type { ThemeMode } from "../../chart/theme";
import { useLayout } from "../../hooks/useLayout";
import type { CellHandle, CellHub } from "../../state/cellHub";
import { chartMenuFor } from "../../state/chartMenuFor";
import { drawingActions, drawingMenuState } from "../../state/drawingActions";
import { createAlertFromChart } from "../../panels/alerts/createFromChart";
import { floatMoreMenu, floatTemplateMenu } from "../../state/drawingMenu";
import { ChartView } from "../ChartView";
import type { MenuItem } from "../menuTypes";
import { CellHeader } from "./CellHeader";

const EMPTY: Drawing[] = [];

/** What the shell needs from the active cell (toolbar, dialogs, backtest panel). */
export interface ActiveCellState {
  index: number;
  layout: Layout;
  /** Link-aware update of this cell's layout. */
  update(fn: (l: Layout) => Layout): void;
  engine: ChartEngine | null;
  info: SymbolInfo | null;
  tool: Tool;
}

/** Stable callbacks from the shell, shared by every cell. */
export interface CellContext {
  hub: CellHub;
  activate(index: number): void;
  report(index: number, state: ActiveCellState | null): void;
  linkedUpdate(index: number, fn: (l: Layout) => Layout): void;
  /** The cell's layout loaded (link groups apply values changed while it was not mounted). */
  cellReady(index: number): void;
  crosshair(index: number, time: number | null): void;
  viewChange(index: number, range: { from: number; to: number }): void;
  toggleMaximize(index: number): void;
  setLink(index: number, color: LinkColor | undefined): void;
  setGroup(group: LinkGroup): void;
  openMenu(x: number, y: number, items: MenuItem[]): void;
  openSearch(initial: string): void;
  openText(id: string, text: string): void;
  openDrawingSettings(id: string): void;
  openIndicatorSettings(uid: string): void;
  openChartSettings(): void;
  /** Drawing list of a cell changed (drawing sync to other charts of the same symbol). */
  drawingsChanged?(index: number, symbol: string, list: Drawing[]): void;
}

interface Props {
  index: number;
  layoutId: string;
  link?: LinkColor;
  linkGroups: LinkGroup[];
  active: boolean;
  showHeader: boolean;
  maximized: boolean;
  theme: ThemeMode;
  showVolume: boolean;
  ctx: CellContext;
}

export const ChartCell = memo(function ChartCell(p: Props) {
  const { index, ctx } = p;
  const { layout, update } = useLayout(p.layoutId);
  const [engine, setEngine] = useState<ChartEngine | null>(null);
  const [info, setInfo] = useState<SymbolInfo | null>(null);
  const [tool, setTool] = useState<Tool>("cursor");
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const engineRef = useRef(engine);
  engineRef.current = engine;

  const cellUpdate = useCallback((fn: (l: Layout) => Layout) => ctx.linkedUpdate(index, fn), [ctx, index]);
  const setIndicators = useCallback(
    (fn: (list: IndicatorInstance[]) => IndicatorInstance[]) => cellUpdate((l) => ({ ...l, indicators: fn(l.indicators) })),
    [cellUpdate],
  );

  // Registry entry for link groups and sync (raw update: link targets never propagate again).
  useEffect(() => {
    const h: CellHandle = { layout: () => layoutRef.current, update, engine: () => engineRef.current };
    ctx.hub.set(index, h);
    return () => ctx.hub.delete(index, h);
  }, [ctx, index, update]);

  // Once the layout is loaded (and again when it is replaced), let the link group catch it up.
  const loadedId = layout?.id;
  useEffect(() => {
    if (loadedId) ctx.cellReady(index);
  }, [ctx, index, loadedId, p.link]);

  useEffect(() => {
    if (p.active && layout) ctx.report(index, { index, layout, update: cellUpdate, engine, info, tool });
  }, [ctx, index, p.active, layout, cellUpdate, engine, info, tool]);
  useEffect(() => {
    if (p.active) return () => ctx.report(index, null);
  }, [ctx, index, p.active]);

  // Crosshair and visible-range events feed the workspace sync.
  useEffect(() => {
    if (!engine) return;
    const offs = [
      engine.events.on("hover", (i) => ctx.crosshair(index, i == null ? null : (engine.data.bars[i]?.time ?? null))),
      engine.events.on("viewChange", (r) => ctx.viewChange(index, r)),
    ];
    return () => offs.forEach((off) => off());
  }, [ctx, engine, index]);

  const onDrawingsChange = useCallback(
    (list: Drawing[]) => {
      update((l) => ({ ...l, drawings: { ...l.drawings, [l.symbol]: list } }));
      const l = layoutRef.current;
      if (l) ctx.drawingsChanged?.(index, l.symbol, list);
    },
    [update, ctx, index],
  );

  const glue = useCallback(() => {
    const e = engineRef.current;
    const l = layoutRef.current;
    return e && l ? { engine: e, layout: l, update: cellUpdate, openDrawingSettings: ctx.openDrawingSettings } : null;
  }, [cellUpdate, ctx]);
  const onDrawingAlert = useCallback((id: string) => glue() && drawingActions(glue()!).alert(id), [glue]);
  const drawingMenu = useCallback(
    (kind: "template" | "more", id: string) => {
      const g = glue();
      const d = g?.engine.drawings.drawings.find((k) => k.id === id);
      if (!g || !d) return null;
      const a = drawingActions(g);
      const st = drawingMenuState(g);
      return kind === "template" ? floatTemplateMenu(d, st.templates, a) : floatMoreMenu(d, st, a);
    },
    [glue],
  );

  const onContextMenu = useCallback(
    (target: ContextTarget, x: number, y: number) => {
      const e = engineRef.current;
      const l = layoutRef.current;
      if (!e || !l) return;
      const items = chartMenuFor(target, {
        engine: e,
        layout: l,
        update: cellUpdate,
        setIndicators,
        openDrawingSettings: ctx.openDrawingSettings,
        openIndicatorSettings: ctx.openIndicatorSettings,
        openChartSettings: ctx.openChartSettings,
      });
      if (items) ctx.openMenu(x, y, items);
    },
    [ctx, cellUpdate, setIndicators],
  );

  const header = useMemo(
    () =>
      p.showHeader && (
        <CellHeader
          symbol={layout?.symbol ?? ""}
          interval={layout ? layout.customInterval || layout.interval : ""}
          link={p.link}
          linkGroups={p.linkGroups}
          maximized={p.maximized}
          onLink={(c) => ctx.setLink(index, c)}
          onGroup={ctx.setGroup}
          onMaximize={() => ctx.toggleMaximize(index)}
        />
      ),
    [p.showHeader, layout?.symbol, layout?.interval, layout?.customInterval, p.link, p.linkGroups, p.maximized, ctx, index],
  );

  return (
    <div
      className={`grid-cell${p.active ? " active" : ""}`}
      data-cell={index}
      data-layout-id={p.layoutId}
      data-symbol={layout?.symbol ?? ""}
      data-interval={layout?.interval ?? ""}
      data-custom-interval={layout?.customInterval ?? ""}
      onPointerDownCapture={() => ctx.activate(index)}
      onFocusCapture={() => ctx.activate(index)}
    >
      {header}
      <div className="cell-body">
        {layout ? (
          <ChartView
            symbol={layout.symbol}
            interval={layout.interval}
            customInterval={layout.customInterval}
            compare={layout.compare}
            onRemoveCompare={(s) => cellUpdate((l) => ({ ...l, compare: (l.compare ?? []).filter((c) => c !== s) }))}
            chartType={layout.chartType}
            logScale={layout.logScale}
            showVolume={p.showVolume}
            indicators={layout.indicators}
            paneRatios={layout.paneRatios}
            chartSettings={layout.chartSettings}
            theme={p.theme}
            autoFocus={p.active}
            onPaneRatios={(r) => update((l) => ({ ...l, paneRatios: r }))}
            drawings={layout.drawings[layout.symbol] ?? EMPTY}
            onEngine={setEngine}
            onInfo={setInfo}
            onDrawingsChange={onDrawingsChange}
            onToolChange={setTool}
            onTextRequest={ctx.openText}
            onTypeToSearch={ctx.openSearch}
            onRemoveIndicator={(uid) => setIndicators((list) => list.filter((i) => i.uid !== uid))}
            onEditIndicator={ctx.openIndicatorSettings}
            onToggleIndicator={(uid) => setIndicators((list) => list.map((i) => (i.uid === uid ? { ...i, visible: !i.visible } : i)))}
            onDrawingSettings={ctx.openDrawingSettings}
            onDrawingAlert={onDrawingAlert}
            onAlertAt={(price) => layoutRef.current && createAlertFromChart(layoutRef.current.symbol, layoutRef.current.interval, price)}
            drawingMenu={drawingMenu}
            onOpenMenu={ctx.openMenu}
            onContextMenu={onContextMenu}
          />
        ) : (
          <div className="boot">Loading layout…</div>
        )}
      </div>
    </div>
  );
});
