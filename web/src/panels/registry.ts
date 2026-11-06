// Right-side panels and the contract between them and the app shell. The App provides a
// `PanelIntegration`; panels call back into the chart only through it.

import type { Bar, Interval, Layout, ScriptRunResult } from "@qt/core";
import type { ChartEngine } from "../chart/ChartEngine";
import panels from "./panels.json";

export type PanelId = "watchlist" | "alerts" | "screener" | "portfolio" | "paper" | "scripts" | "objects" | "tape" | "data";

export interface PanelDef {
  id: PanelId;
  label: string;
  /** Icon name in panels/panelIcons.tsx. */
  icon: string;
  /** Alt+<key> opens the panel. */
  key: string;
  /** Default content width in px (the user can drag the edge). */
  width: number;
}

export const PANELS = panels as PanelDef[];
export const panelDef = (id: PanelId): PanelDef => PANELS.find((p) => p.id === id) ?? PANELS[0];

/** What the panels need to know about the active chart. */
export interface ActiveChartContext {
  symbol: string;
  interval: Interval;
  /** Saved layout of the active chart (drawing alerts refer to its drawings). */
  layoutId: string;
  /** Bars currently loaded in the active chart (may be empty while loading). */
  bars: readonly Bar[];
}

/** Last close of the active chart, when it has bars. */
export const lastPriceOf = (ctx: ActiveChartContext | null): number | null => {
  const b = ctx?.bars;
  return b && b.length ? b[b.length - 1].close : null;
};

/** Callbacks the App provides to the panels. */
export interface PanelIntegration {
  /** Symbol of the active chart (highlighted in the watchlist). */
  activeSymbol: string;
  /** Load a symbol into the active chart cell and its link group. */
  onLoadSymbol(symbol: string): void;
  /** Snapshot of the active chart, read when a panel needs it (e.g. new alert defaults). */
  getActiveChartContext(): ActiveChartContext | null;
  /** Render a user script's plots on the active chart (ChartEngine.setScriptPlots(plots, outputs)). */
  onAddScriptPlots(result: ScriptRunResult): void;
  /** Live handles of the active chart for the object tree (null while none is loaded). */
  activeChart?: ActiveChartHandles | null;
}

/** The active chart's engine and layout (object tree: drawings, groups, indicators). */
export interface ActiveChartHandles {
  engine: ChartEngine;
  layout: Layout;
  update(fn: (l: Layout) => Layout): void;
  openDrawingSettings(id: string): void;
  openIndicatorSettings(uid: string): void;
}
