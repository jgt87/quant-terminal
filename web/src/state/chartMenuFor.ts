// Picks and fills the context menu for whatever the engine hit-test found under the pointer.

import type { ChartSettings, IndicatorInstance, Layout } from "@qt/core";
import type { ChartEngine, ContextTarget } from "../chart/ChartEngine";
import { newDrawingId } from "../chart/drawings/DrawingController";
import { exportChartCsv, exportChartPng } from "../chart/export/chartExport";
import { anyIndicator, CONVERTIBLE } from "../chart/studies/defs";
import { studyToDrawings } from "../chart/studies/render";
import { formatPrice } from "../chart/format";
import { SEP, type MenuItem } from "../components/menuTypes";
import { createAlertFromChart } from "../panels/alerts/createFromChart";
import { openPanelRequests } from "../panels/bus";
import { chartMenu, indicatorMenu, priceAxisMenu } from "./menus";
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

export function copyText(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    /* clipboard unavailable (insecure context or denied) */
  });
}

function setScales(deps: ChartMenuDeps, patch: NonNullable<ChartSettings["scales"]>): void {
  deps.update((l) => ({ ...l, chartSettings: { ...l.chartSettings, scales: { ...l.chartSettings?.scales, ...patch } } }));
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
      return indicatorMenu(inst, pane, {
        convert: c && CONVERTIBLE.has(inst.indicatorId) ? () => engine.addDrawings(studyToDrawings(engine, c, newDrawingId)) : undefined,
        settings: () => deps.openIndicatorSettings(inst.uid),
        toggleVisible: () => deps.setIndicators((list) => list.map((i) => (i.uid === inst.uid ? { ...i, visible: !i.visible } : i))),
        movePane: (to) => deps.setIndicators((list) => list.map((i) => (i.uid === inst.uid ? { ...i, pane: to === def.pane ? undefined : to } : i))),
        remove: () => deps.setIndicators((list) => list.filter((i) => i.uid !== inst.uid)),
      });
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
          percent: pane.main && Boolean(scales?.percent),
          lastPriceLabel: scales?.lastPriceLabel !== false,
        },
        {
          setAuto: (on) => engine.setAutoScale(target.pane, on),
          setLog: (on) => deps.update((l) => ({ ...l, logScale: on })),
          setPercent: (on) => setScales(deps, { percent: on }),
          reset: () => engine.resetPriceScale(target.pane),
          setLastPriceLabel: (on) => setScales(deps, { lastPriceLabel: on }),
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
        },
      )];
    }
  }
}
