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
  /** Order flow parts switched on; `orderFlowAvailable` is false for non-Binance symbols. */
  orderFlow?: { footprint?: boolean; bubbles?: boolean; delta?: boolean; cvd?: boolean };
  orderFlowAvailable?: boolean;
}

export interface ChartMenuActions {
  /** Studies that can become drawings: [label, action]. */
  convert?: { label: string; run(): void }[];
  exportCsv?(): void;
  exportPng?(): void;
  exportSvg?(): void;
  /** Opens the data table panel (bars and indicator values). */
  dataTable?(): void;
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
  setOrderFlow?(patch: { footprint?: boolean; bubbles?: boolean; delta?: boolean; cvd?: boolean }): void;
  /** Opens the time and sales panel. */
  timeAndSales?(): void;
}

/** "Order flow ▸": footprint, bubbles, delta panes and the time and sales panel (Binance symbols). */
function orderFlowMenu(s: ChartMenuState, a: ChartMenuActions): MenuItem[] {
  if (!a.setOrderFlow) return [];
  const f = s.orderFlow ?? {};
  const off = s.orderFlowAvailable === false;
  const item = (label: string, key: "footprint" | "bubbles" | "delta" | "cvd") => ({
    label,
    checked: Boolean(f[key]),
    disabled: off && !f[key],
    onSelect: () => a.setOrderFlow?.({ [key]: !f[key] }),
  });
  return [
    {
      label: "Order flow",
      submenu: [
        ...(off ? [{ type: "header" as const, label: "Needs a Binance symbol" }] : []),
        item("Footprint", "footprint"),
        item("Volume bubbles", "bubbles"),
        item("Delta", "delta"),
        item("Cumulative delta", "cvd"),
        ...(a.timeAndSales ? [SEP, { label: "Time and sales", onSelect: a.timeAndSales }] : []),
      ],
    },
  ];
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
    ...orderFlowMenu(s, a),
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
    ...(a.exportSvg ? [{ label: "Save image (SVG)", onSelect: a.exportSvg }] : []),
    ...(a.dataTable ? [{ label: "Data table", onSelect: a.dataTable }] : []),
    ...(a.exportCsv || a.exportPng || a.exportSvg || a.dataTable ? [SEP] : []),
    { label: "Chart settings…", icon: "settings", onSelect: a.openChartSettings },
  ];
}

// Drawing menus live in state/drawingMenu.ts (generic, multi-selection and per-tool menus).

/** Where an indicator can be moved: the price pane, a new pane, or the pane of another indicator. */
export type PaneTarget = { kind: "overlay" } | { kind: "new" } | { kind: "with"; uid: string };

/** Another separate pane the indicator can join (its first indicator names it). */
export interface PaneChoice {
  uid: string;
  label: string;
  /** The indicator is in this pane now. */
  current: boolean;
}

export interface IndicatorPaneState {
  /** Other indicator panes (the price pane and "new pane" are added by the menu). */
  panes: PaneChoice[];
  ownScale: boolean;
  /** The indicator's pane is maximised / collapsed. */
  maximized: boolean;
  collapsed: boolean;
}

export interface IndicatorMenuActions {
  /** Built-in studies with geometry (auto fib, chart patterns, zig zag): make editable drawings. */
  convert?(): void;
  settings(): void;
  toggleVisible(): void;
  movePane(to: PaneTarget): void;
  setOwnScale(on: boolean): void;
  toggleMaximized(): void;
  toggleCollapsed(): void;
  remove(): void;
}

/** `pane` is where the indicator is drawn now (definition default or instance override). */
export function indicatorMenu(inst: IndicatorInstance, pane: "overlay" | "separate", a: IndicatorMenuActions, s?: IndicatorPaneState): MenuItem[] {
  const moveTo: MenuItem[] = [
    { label: "Price pane", checked: pane === "overlay", onSelect: () => a.movePane({ kind: "overlay" }) },
    { label: "New pane below", onSelect: () => a.movePane({ kind: "new" }) },
    ...(s?.panes.length ? [SEP, ...s.panes.map((p) => ({ label: p.label, checked: p.current, onSelect: () => a.movePane({ kind: "with", uid: p.uid }) }))] : []),
  ];
  return [
    { label: "Settings…", onSelect: a.settings },
    { label: inst.visible ? "Hide" : "Show", onSelect: a.toggleVisible },
    ...(a.convert ? [{ label: "Convert to drawing", onSelect: a.convert }] : []),
    SEP,
    { label: "Move to", submenu: moveTo },
    {
      label: "Scale",
      submenu: [
        { label: "Pane scale", checked: !s?.ownScale, onSelect: () => a.setOwnScale(false) },
        { label: "Own scale (no axis)", checked: Boolean(s?.ownScale), onSelect: () => a.setOwnScale(true) },
      ],
    },
    { label: s?.maximized ? "Restore panes" : "Maximize pane", shortcut: "Ctrl+Dbl-click", onSelect: a.toggleMaximized },
    ...(pane === "separate" ? [{ label: s?.collapsed ? "Expand pane" : "Collapse pane", onSelect: a.toggleCollapsed }] : []),
    SEP,
    { label: "Remove", onSelect: a.remove },
  ];
}

export interface PriceAxisState {
  main: boolean;
  autoScale: boolean;
  log: boolean;
  percent: boolean;
  indexed: boolean;
  inverted: boolean;
  lastPriceLabel: boolean;
  maximized: boolean;
  collapsed: boolean;
}

export interface PriceAxisActions {
  setAuto(on: boolean): void;
  setLog(on: boolean): void;
  setPercent(on: boolean): void;
  setIndexed(on: boolean): void;
  setInverted(on: boolean): void;
  reset(): void;
  setLastPriceLabel(on: boolean): void;
  toggleMaximized(): void;
  toggleCollapsed(): void;
}

export function priceAxisMenu(s: PriceAxisState, a: PriceAxisActions): MenuItem[] {
  return [
    { label: "Auto scale", checked: s.autoScale, onSelect: () => a.setAuto(!s.autoScale) },
    { label: "Logarithmic", checked: s.log, disabled: !s.main, onSelect: () => a.setLog(!s.log) },
    { label: "Percent", checked: s.percent, disabled: !s.main, onSelect: () => a.setPercent(!s.percent) },
    { label: "Indexed to 100", checked: s.indexed, disabled: !s.main, onSelect: () => a.setIndexed(!s.indexed) },
    { label: "Invert scale", checked: s.inverted, disabled: !s.main, onSelect: () => a.setInverted(!s.inverted) },
    SEP,
    { label: s.maximized ? "Restore panes" : "Maximize pane", shortcut: "Ctrl+Dbl-click", onSelect: a.toggleMaximized },
    ...(s.main ? [] : [{ label: s.collapsed ? "Expand pane" : "Collapse pane", onSelect: a.toggleCollapsed }]),
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
