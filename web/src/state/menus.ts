// Context menu contents per right-click target. Pure builders: the caller supplies the state
// and the actions; the menu component only renders what comes back.

import type { ChartType, IndicatorInstance, OrderFlowFlags } from "@qt/core";
import chartTypes from "../config/chartTypes.json";
import { ZONE_CHOICES } from "../chart/timeZone";
import { t } from "../i18n";
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
  orderFlow?: OrderFlowFlags;
  orderFlowAvailable?: boolean;
  /** The symbol's order book is being recorded to disk. */
  depthRecording?: boolean;
  /** Chart time zone setting ("UTC", "local", "exchange" or an IANA zone). */
  timeZone?: string;
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
  setOrderFlow?(patch: OrderFlowFlags): void;
  /** Turns disk recording of the symbol's order book on / off. */
  setDepthRecording?(on: boolean): void;
  /** Opens the time and sales panel. */
  timeAndSales?(): void;
  /** Opens the depth ladder panel. */
  depthLadder?(): void;
  setTimeZone?(zone: string): void;
}

/** "Order flow ▸": footprint, bubbles, delta panes and the time and sales panel (Binance symbols). */
function orderFlowMenu(s: ChartMenuState, a: ChartMenuActions): MenuItem[] {
  if (!a.setOrderFlow) return [];
  const f = s.orderFlow ?? {};
  const off = s.orderFlowAvailable === false;
  const item = (label: string, key: keyof OrderFlowFlags) => ({
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
        SEP,
        item("Liquidity heatmap", "heatmap"),
        item("Signals (absorption, stop runs, icebergs)", "signals"),
        ...(a.setDepthRecording
          ? [{ label: "Record order book", checked: Boolean(s.depthRecording), disabled: off && !s.depthRecording, onSelect: () => a.setDepthRecording?.(!s.depthRecording) }]
          : []),
        ...(a.timeAndSales || a.depthLadder ? [SEP] : []),
        ...(a.timeAndSales ? [{ label: "Time and sales", onSelect: a.timeAndSales }] : []),
        ...(a.depthLadder ? [{ label: "Depth ladder", onSelect: a.depthLadder }] : []),
      ],
    },
  ];
}

/** "Time zone ▸": UTC, local, exchange and named zones. */
function timeZoneMenu(s: ChartMenuState, a: ChartMenuActions): MenuItem[] {
  if (!a.setTimeZone) return [];
  const cur = s.timeZone ?? "UTC";
  const pick = (z: { id: string; label: string }) => ({ label: z.label, checked: z.id === cur, onSelect: () => a.setTimeZone?.(z.id) });
  const fixed = ZONE_CHOICES.filter((z) => !z.id.includes("/"));
  const named = ZONE_CHOICES.filter((z) => z.id.includes("/"));
  return [{ label: "Time zone", submenu: [...fixed.map(pick), SEP, ...named.map(pick)] }];
}

export function chartMenu(s: ChartMenuState, a: ChartMenuActions): MenuItem[] {
  const n = s.drawingCount;
  return [
    { label: "Reset chart view", onSelect: a.resetView },
    SEP,
    { label: t("Copy price {price}", { price: s.priceText }), onSelect: () => a.copy(s.priceText) },
    ...(a.paste && s.clipboard ? [{ label: "Paste", icon: "paste", shortcut: "Ctrl+V", onSelect: a.paste }] : []),
    SEP,
    ...(a.addAlert ? [{ label: t("Add alert on {symbol} at {price}…", { symbol: s.symbol ?? "", price: s.priceText }), icon: "alertBell", shortcut: "Alt+A", onSelect: a.addAlert }, SEP] : []),
    {
      label: "Chart type",
      submenu: chartTypes.map((t) => ({ label: t.label, checked: t.id === s.chartType, onSelect: () => a.setChartType(t.id as ChartType) })),
    },
    { label: "Log scale", checked: s.logScale, onSelect: () => a.setLog(!s.logScale) },
    ...timeZoneMenu(s, a),
    ...orderFlowMenu(s, a),
    SEP,
    ...(a.convert ?? []).map((c) => ({ label: c.label, onSelect: c.run })),
    ...(a.convert?.length ? [SEP] : []),
    ...(a.objectTree ? [{ label: "Object tree", icon: "objectTree", onSelect: a.objectTree }, SEP] : []),
    { label: n ? t(n === 1 ? "Remove 1 drawing" : "Remove {n} drawings", { n }) : t("Remove drawings"), disabled: n === 0, onSelect: a.removeDrawings },
    ...(s.hiddenDrawings ? [{ label: t("Show hidden drawings ({n})", { n: s.hiddenDrawings }), onSelect: a.showHiddenDrawings }] : []),
    ...(a.setHideAllDrawings ? [{ label: "Hide all drawings", shortcut: "Ctrl+Alt+H", checked: Boolean(s.hideAllDrawings), onSelect: () => a.setHideAllDrawings?.(!s.hideAllDrawings) }] : []),
    ...(a.setLockAllDrawings ? [{ label: "Lock all drawings", checked: Boolean(s.lockAllDrawings), onSelect: () => a.setLockAllDrawings?.(!s.lockAllDrawings) }] : []),
    ...(a.setSyncDrawings
      ? [{ label: "Sync drawings across charts", checked: Boolean(s.syncDrawings), onSelect: () => a.setSyncDrawings?.(!s.syncDrawings) }]
      : []),
    { label: s.indicatorCount ? t("Remove indicators ({n})", { n: s.indicatorCount }) : t("Remove indicators"), disabled: s.indicatorCount === 0, onSelect: a.removeIndicators },
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
  /** On its own scale shown on the left price axis. */
  leftScale?: boolean;
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
  setLeftScale?(on: boolean): void;
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
        { label: "Pane scale", checked: !s?.ownScale && !s?.leftScale, onSelect: () => a.setOwnScale(false) },
        ...(a.setLeftScale ? [{ label: "Left scale", checked: Boolean(s?.leftScale), onSelect: () => a.setLeftScale?.(true) }] : []),
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
  /** Main price axis side. */
  placement?: "right" | "left" | "both";
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
  setPlacement?(p: "right" | "left" | "both"): void;
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
    ...(a.setPlacement
      ? [
          {
            label: "Scale position",
            submenu: (["right", "left", "both"] as const).map((p) => ({
              label: p === "right" ? "Right" : p === "left" ? "Left" : "Left and right",
              checked: (s.placement ?? "right") === p,
              onSelect: () => a.setPlacement?.(p),
            })),
          },
        ]
      : []),
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
