// Picks and fills the context menu for whatever the engine hit-test found under the pointer.

import type { ChartSettings, IndicatorInstance, Layout } from "@qt/core";
import type { ChartEngine, ContextTarget } from "../chart/ChartEngine";
import { newDrawingId } from "../chart/drawings/DrawingController";
import { exportChartCsv, exportChartPng, exportChartSvg } from "../chart/export/chartExport";
import { anyIndicator, CONVERTIBLE } from "../chart/studies/defs";
import { studyToDrawings } from "../chart/studies/render";
import { formatPrice } from "../chart/format";
import { SEP, type MenuItem } from "../components/menuTypes";
import { createAlertFromChart } from "../panels/alerts/createFromChart";
import { openPanelRequests } from "../panels/bus";
import { isDepthRecording, loadDepthRecordings, setDepthRecording } from "../api/depth";
import { chartMenu, indicatorMenu, priceAxisMenu, type PaneTarget } from "./menus";
import { clipboardCount } from "../chart/drawings/clipboard";
import { drawingActions, drawingMenuState } from "./drawingActions";
import { drawingMenuFor } from "./drawingMenu";
import { drawingPrefs, setDrawingPrefs } from "./drawingPrefs";

export interface ChartMenuDeps {
  engine: ChartEngine;
  layout: Layout;
  update(fn: (l: Layout) => Layout): void;
  setIndicators(fn: (list: IndicatorInstance[]) => IndicatorInstance[]): void;
  openDrawingSettings(id: string): void;
  openIndicatorSettings(uid: string): void;
  openChartSettings(): void;
}

/** `BINANCE:XXX`, or a bare stablecoin pair the server routes to Binance. */
export function isBinanceSymbol(symbol: string): boolean {
  const s = symbol.trim().toUpperCase();
  return s.startsWith("BINANCE:") || /^[A-Z0-9]{2,}(USDT|USDC|BUSD|FDUSD)$/.test(s);
}

export function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    /* clipboard unavailable (insecure context or denied) */
  });
}

function setScales(deps: ChartMenuDeps, patch: NonNullable<ChartSettings["scales"]>): void {
  deps.update((l) => ({ ...l, chartSettings: { ...l.chartSettings, scales: { ...l.chartSettings?.scales, ...patch } } }));
}

/**
 * Moves indicator `uid` to the price pane, a new pane, or the pane of indicator `to.uid`.
 * Indicators that shared the moved one's pane stay together (the next one hosts them).
 */
export function movedIndicators(
  list: IndicatorInstance[],
  uid: string,
  to: PaneTarget,
  defaultPane: (indicatorId: string) => "overlay" | "separate" | undefined,
): IndicatorInstance[] {
  const host = list.find((i) => i.paneWith === uid && i.uid !== uid);
  return list.map((i) => {
    if (i.uid === uid) {
      const def = defaultPane(i.indicatorId);
      if (to.kind === "overlay") return { ...i, pane: def === "overlay" ? undefined : "overlay", paneWith: undefined };
      const pane = def === "separate" ? undefined : ("separate" as const);
      return { ...i, pane, paneWith: to.kind === "with" && to.uid !== uid ? to.uid : undefined };
    }
    // Members of the moved indicator's pane follow its next member.
    if (host && i.paneWith === uid) return i.uid === host.uid ? { ...i, paneWith: undefined } : { ...i, paneWith: host.uid };
    return i;
  });
}

export function chartMenuFor(target: ContextTarget, deps: ChartMenuDeps): MenuItem[] | null {
  const { engine, layout } = deps;
  switch (target.kind) {
    case "drawing": {
      const d = engine.drawings.drawings.find((k) => k.id === target.id);
      if (!d) return null;
      const glue = { engine, layout, update: deps.update, openDrawingSettings: deps.openDrawingSettings };
      return drawingMenuFor(d, engine.drawings.selectedIds, drawingMenuState(glue), drawingActions(glue));
    }
    case "indicator": {
      const inst = layout.indicators.find((i) => i.uid === target.uid);
      const def = inst ? anyIndicator(inst.indicatorId) : undefined;
      if (!inst || !def) return null;
      const pane = inst.pane ?? def.pane;
      const c = engine.indicators.get(inst.uid);
      const paneIndex = engine.panes.findIndex((p) => p.uids.includes(inst.uid));
      const own = engine.panes[paneIndex];
      const patch = (fn: (i: IndicatorInstance) => IndicatorInstance) => deps.setIndicators((list) => list.map((i) => (i.uid === inst.uid ? fn(i) : i)));
      return indicatorMenu(
        inst,
        pane,
        {
          convert: c && CONVERTIBLE.has(inst.indicatorId) ? () => engine.addDrawings(studyToDrawings(engine, c, newDrawingId)) : undefined,
          settings: () => deps.openIndicatorSettings(inst.uid),
          toggleVisible: () => patch((i) => ({ ...i, visible: !i.visible })),
          movePane: (to) => deps.setIndicators((list) => movedIndicators(list, inst.uid, to, (id) => anyIndicator(id)?.pane)),
          setOwnScale: (on) => patch((i) => ({ ...i, scale: on ? "own" : undefined })),
          setLeftScale: (on) => patch((i) => ({ ...i, scale: on ? "left" : undefined })),
          toggleMaximized: () => engine.togglePaneMaximized(paneIndex),
          toggleCollapsed: () => engine.togglePaneCollapsed(paneIndex),
          remove: () => deps.setIndicators((list) => list.filter((i) => i.uid !== inst.uid)),
        },
        {
          panes: engine.panes
            .filter((p) => !p.main)
            .filter((p) => p !== own || p.uids[0] !== inst.uid || p.uids.length > 1)
            .map((p) => ({
              uid: p.uids[0],
              label: p.uids.map((u) => engine.indicators.get(u)?.def.shortName ?? u).join(", "),
              current: p === own,
            })),
          ownScale: inst.scale === "own",
          leftScale: inst.scale === "left",
          maximized: own != null && engine.maximizedPane === own.id,
          collapsed: own?.collapsed === true,
        },
      );
    }
    case "priceAxis": {
      const pane = engine.panes[target.pane];
      if (!pane) return null;
      const scales = layout.chartSettings?.scales;
      return priceAxisMenu(
        {
          main: pane.main,
          autoScale: pane.ps.auto,
          log: pane.main && layout.logScale,
          percent: pane.main && Boolean(scales?.percent) && !scales?.indexed,
          indexed: pane.main && Boolean(scales?.indexed),
          inverted: pane.main && Boolean(scales?.inverted),
          lastPriceLabel: scales?.lastPriceLabel !== false,
          maximized: engine.maximizedPane === pane.id,
          collapsed: pane.collapsed,
          placement: scales?.placement,
        },
        {
          setAuto: (on) => engine.setAutoScale(target.pane, on),
          setLog: (on) => deps.update((l) => ({ ...l, logScale: on })),
          setPercent: (on) => setScales(deps, { percent: on, indexed: on ? false : scales?.indexed }),
          setIndexed: (on) => setScales(deps, { indexed: on, percent: on ? false : scales?.percent }),
          setInverted: (on) => setScales(deps, { inverted: on }),
          reset: () => engine.resetPriceScale(target.pane),
          setLastPriceLabel: (on) => setScales(deps, { lastPriceLabel: on }),
          toggleMaximized: () => engine.togglePaneMaximized(target.pane),
          toggleCollapsed: () => engine.togglePaneCollapsed(target.pane),
          setPlacement: (placement) => setScales(deps, { placement: placement === "right" ? undefined : placement }),
        },
      );
    }
    case "chart": {
      const ps = engine.panes[target.pane]?.ps ?? engine.mainPane.ps;
      const drawings = engine.drawings.drawings;
      const priceText = formatPrice(target.price, ps.formatDecimals(target.price));
      return [...chartMenu(
        {
          chartType: layout.chartType,
          logScale: layout.logScale,
          drawingCount: drawings.length,
          hiddenDrawings: drawings.filter((d) => d.hidden).length,
          indicatorCount: layout.indicators.length,
          priceText,
          symbol: layout.symbol,
          clipboard: clipboardCount(),
          hideAllDrawings: drawingPrefs().hideAll,
          lockAllDrawings: drawingPrefs().lockAll,
          syncDrawings: drawingPrefs().syncDrawings,
          orderFlow: layout.chartSettings?.orderFlow,
          orderFlowAvailable: isBinanceSymbol(layout.symbol),
          depthRecording: (void loadDepthRecordings(), isDepthRecording(layout.symbol)),
          timeZone: layout.chartSettings?.timeZone,
        },
        {
          convert: engine.indicators.items
            .filter((c) => CONVERTIBLE.has(c.def.id) && engine.indicatorShown(c))
            .map((c) => ({
              label: `Convert ${c.def.name} to drawing`,
              run: () => engine.addDrawings(studyToDrawings(engine, c, newDrawingId, engine.ts.timeToX(target.time))),
            })),
          exportCsv: () => exportChartCsv(engine, layout.symbol, layout.customInterval || layout.interval),
          exportPng: () => void exportChartPng(engine, layout.symbol, layout.customInterval || layout.interval),
          exportSvg: () => exportChartSvg(engine, layout.symbol, layout.customInterval || layout.interval),
          dataTable: () => openPanelRequests.emit("data"),
          resetView: () => engine.resetView(),
          copy: copyText,
          setChartType: (t) => deps.update((l) => ({ ...l, chartType: t })),
          setLog: (on) => deps.update((l) => ({ ...l, logScale: on })),
          removeDrawings: () => engine.removeAllDrawings(),
          showHiddenDrawings: () => {
            for (const d of drawings) if (d.hidden) engine.updateDrawing(d.id, (k) => ({ ...k, hidden: undefined }));
          },
          removeIndicators: () => deps.setIndicators(() => []),
          openChartSettings: deps.openChartSettings,
          paste: () => engine.drawings.paste(),
          addAlert: () => createAlertFromChart(layout.symbol, layout.interval, target.price),
          objectTree: () => openPanelRequests.emit("objects"),
          setHideAllDrawings: (on) => setDrawingPrefs({ hideAll: on }),
          setLockAllDrawings: (on) => setDrawingPrefs({ lockAll: on }),
          setSyncDrawings: (on) => setDrawingPrefs({ syncDrawings: on }),
          setOrderFlow: (patch) =>
            deps.update((l) => ({ ...l, chartSettings: { ...l.chartSettings, orderFlow: { ...l.chartSettings?.orderFlow, ...patch } } })),
          timeAndSales: () => openPanelRequests.emit("tape"),
          depthLadder: () => openPanelRequests.emit("dom"),
          setTimeZone: (zone) => deps.update((l) => ({ ...l, chartSettings: { ...l.chartSettings, timeZone: zone === "UTC" ? undefined : zone } })),
          setDepthRecording: (on) => void setDepthRecording(layout.symbol, on).catch(() => {}),
        },
      )];
    }
  }
}
