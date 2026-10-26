// Context menu contents per right-click target. Pure builders: the caller supplies the state
// and the actions; the menu component only renders what comes back.

import type { ChartType, IndicatorInstance } from "@qt/core";
import chartTypes from "../config/chartTypes.json";
import { SEP, type MenuItem } from "../components/menuTypes";

export interface ChartMenuState {
  chartType: ChartType;
  logScale: boolean;
  drawingCount: number;
  hiddenDrawings: number;
  indicatorCount: number;
  priceText: string;
  /** Drawings on the internal clipboard (Paste is offered when > 0). */
  clipboard?: number;
  hideAllDrawings?: boolean;
  lockAllDrawings?: boolean;
  syncDrawings?: boolean;
  symbol?: string;
}

export interface ChartMenuActions {
  /** Studies that can become drawings: [label, action]. */
  convert?: { label: string; run(): void }[];
  exportCsv?(): void;
  exportPng?(): void;
  resetView(): void;
  copy(text: string): void;
  setChartType(t: ChartType): void;
  setLog(on: boolean): void;
  removeDrawings(): void;
  showHiddenDrawings(): void;
  removeIndicators(): void;
  openChartSettings(): void;
  paste?(): void;
  setHideAllDrawings?(on: boolean): void;
  setLockAllDrawings?(on: boolean): void;
  setSyncDrawings?(on: boolean): void;
  /** "Add alert on {symbol} at {price}…" (Alt+A). */
  addAlert?(): void;
  objectTree?(): void;
}

export function chartMenu(s: ChartMenuState, a: ChartMenuActions): MenuItem[] {
  const n = s.drawingCount;
  return [
    { label: "Reset chart view", onSelect: a.resetView },
    SEP,
    { label: `Copy price ${s.priceText}`, onSelect: () => a.copy(s.priceText) },
    ...(a.paste && s.clipboard ? [{ label: "Paste", icon: "paste", shortcut: "Ctrl+V", onSelect: a.paste }] : []),
    SEP,
    ...(a.addAlert ? [{ label: `Add alert on ${s.symbol ?? ""} at ${s.priceText}…`, icon: "alertBell", shortcut: "Alt+A", onSelect: a.addAlert }, SEP] : []),
    {
      label: "Chart type",
      submenu: chartTypes.map((t) => ({ label: t.label, checked: t.id === s.chartType, onSelect: () => a.setChartType(t.id as ChartType) })),
    },
    { label: "Log scale", checked: s.logScale, onSelect: () => a.setLog(!s.logScale) },
    SEP,
    ...(a.convert ?? []).map((c) => ({ label: c.label, onSelect: c.run })),
    ...(a.convert?.length ? [SEP] : []),
    ...(a.objectTree ? [{ label: "Object tree", icon: "objectTree", onSelect: a.objectTree }, SEP] : []),
    { label: n ? `Remove ${n} drawing${n === 1 ? "" : "s"}` : "Remove drawings", disabled: n === 0, onSelect: a.removeDrawings },
    ...(s.hiddenDrawings ? [{ label: `Show hidden drawings (${s.hiddenDrawings})`, onSelect: a.showHiddenDrawings }] : []),
    ...(a.setHideAllDrawings ? [{ label: "Hide all drawings", shortcut: "Ctrl+Alt+H", checked: Boolean(s.hideAllDrawings), onSelect: () => a.setHideAllDrawings?.(!s.hideAllDrawings) }] : []),
    ...(a.setLockAllDrawings ? [{ label: "Lock all drawings", checked: Boolean(s.lockAllDrawings), onSelect: () => a.setLockAllDrawings?.(!s.lockAllDrawings) }] : []),
    ...(a.setSyncDrawings
      ? [{ label: "Sync drawings across charts", checked: Boolean(s.syncDrawings), onSelect: () => a.setSyncDrawings?.(!s.syncDrawings) }]
      : []),
    { label: `Remove indicators${s.indicatorCount ? ` (${s.indicatorCount})` : ""}`, disabled: s.indicatorCount === 0, onSelect: a.removeIndicators },
    SEP,
    ...(a.exportCsv ? [{ label: "Export data (CSV)", onSelect: a.exportCsv }] : []),
    ...(a.exportPng ? [{ label: "Save image (PNG)", onSelect: a.exportPng }] : []),
    ...(a.exportCsv || a.exportPng ? [SEP] : []),
    { label: "Chart settings…", icon: "settings", onSelect: a.openChartSettings },
  ];
}

// Drawing menus live in state/drawingMenu.ts (generic, multi-selection and per-tool menus).

export interface IndicatorMenuActions {
  /** Built-in studies with geometry (auto fib, chart patterns, zig zag): make editable drawings. */
  convert?(): void;
  settings(): void;
  toggleVisible(): void;
  movePane(to: "overlay" | "separate"): void;
  remove(): void;
}

/** `pane` is where the indicator is drawn now (definition default or instance override). */
export function indicatorMenu(inst: IndicatorInstance, pane: "overlay" | "separate", a: IndicatorMenuActions): MenuItem[] {
  return [
    { label: "Settings…", onSelect: a.settings },
    { label: inst.visible ? "Hide" : "Show", onSelect: a.toggleVisible },
    ...(a.convert ? [{ label: "Convert to drawing", onSelect: a.convert }] : []),
    SEP,
    pane === "overlay"
      ? { label: "Move to new pane", onSelect: () => a.movePane("separate") }
      : { label: "Move to main pane (overlay)", onSelect: () => a.movePane("overlay") },
    SEP,
    { label: "Remove", onSelect: a.remove },
  ];
}

export interface PriceAxisState {
  main: boolean;
  autoScale: boolean;
  log: boolean;
  percent: boolean;
  lastPriceLabel: boolean;
}

export interface PriceAxisActions {
  setAuto(on: boolean): void;
  setLog(on: boolean): void;
  setPercent(on: boolean): void;
  reset(): void;
  setLastPriceLabel(on: boolean): void;
}

export function priceAxisMenu(s: PriceAxisState, a: PriceAxisActions): MenuItem[] {
  return [
    { label: "Auto scale", checked: s.autoScale, onSelect: () => a.setAuto(!s.autoScale) },
    { label: "Logarithmic", checked: s.log, disabled: !s.main, onSelect: () => a.setLog(!s.log) },
    { label: "Percent", checked: s.percent, disabled: !s.main, onSelect: () => a.setPercent(!s.percent) },
    SEP,
    { label: "Reset price scale", onSelect: a.reset },
    SEP,
    { label: "Show last price label", checked: s.lastPriceLabel, disabled: !s.main, onSelect: () => a.setLastPriceLabel(!s.lastPriceLabel) },
  ];
}

export interface WatchlistRowActions {
  open(): void;
  copy(): void;
  moveUp(): void;
  moveDown(): void;
  addTo(listId: string): void;
  remove(): void;
}

export function watchlistRowMenu(
  index: number,
  count: number,
  otherLists: { id: string; name: string; has: boolean }[],
  a: WatchlistRowActions,
): MenuItem[] {
  return [
    { label: "Open chart", onSelect: a.open },
    { label: "Copy symbol", onSelect: a.copy },
    SEP,
    { label: "Move up", disabled: index === 0, onSelect: a.moveUp },
    { label: "Move down", disabled: index >= count - 1, onSelect: a.moveDown },
    {
      label: "Add to list",
      disabled: otherLists.length === 0,
      submenu: otherLists.map((l) => ({ label: l.name, checked: l.has, disabled: l.has, onSelect: () => a.addTo(l.id) })),
    },
    SEP,
    { label: "Remove", onSelect: a.remove },
  ];
}
