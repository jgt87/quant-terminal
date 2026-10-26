// Long / short position (catalog LineToolRiskRewardLong / LineToolRiskRewardShort): a risk/reward
// box from the entry anchor to the right edge with a shaded profit zone (entry → target) and loss
// zone (entry → stop), position sizing from the account inputs, and the open / closed P&L once
// later bars reach the target or the stop.
//
// Storage: anchors[0] = entry (start time, entry price); anchors[1] = right edge (end time; its price
// is the initial target hint from creation). Stop and target are tick distances from the entry
// (props.stopLevel / props.profitLevel, catalog keys) so the box moves with its anchors.
// The Inputs are derived fields (get / set) and always agree: "Entry price" reads and moves the
// entry anchor (stop and target keep their distances); "Ticks" and "Price" of a level are two views
// of the same level: typing ticks moves the price, typing a price stores it (props.profitPrice /
// props.stopPrice) and the ticks show its distance. Dragging the entry or a level handle converts
// to tick distances. Old layouts with props.entryPrice keep their entry until it is edited.
// Defaults where the catalog says "per-drawing": target = the creation hint distance (1 % of the
// entry when the hint is empty), stop = the same distance (R:R 1).

import {
  positionOutcome,
  positionPrices,
  positionStats,
  forecastInBox,
  tickSizeFor,
  ticksIn,
  type Drawing,
  type PositionInputs,
  type PositionLevels,
  type PositionSide,
  type PositionStats,
} from "@qt/core";
import { formatPrice } from "../../../format";
import { catalogColor } from "../../builders";
import { line, prop } from "../../draw";
import type { DrawCtx, DrawingToolDef, SettingsField, ToolGeom } from "../../types";
import { CATALOG_FONT_SIZES, fmtNum, labelBox, numProp, solid } from "./common";

const INFO_BLOCKS: { key: string; label: string; def: boolean }[] = [
  { key: "tpPriceOffset", label: "TP price offset", def: true },
  { key: "tpPercentOffset", label: "TP percent offset", def: true },
  { key: "tpTickOffset", label: "TP tick offset", def: true },
  { key: "tpAmount", label: "TP amount", def: true },
  { key: "tpPL", label: "TP PL", def: false },
  { key: "openClosePL", label: "Open/closed PL", def: true },
  { key: "qty", label: "Qty", def: true },
  { key: "riskRewardRatio", label: "Risk/reward ratio", def: true },
  { key: "slPriceOffset", label: "SL price offset", def: true },
  { key: "slPercentOffset", label: "SL percent offset", def: true },
  { key: "slTickOffset", label: "SL tick offset", def: true },
  { key: "slAmount", label: "SL amount", def: true },
  { key: "slPL", label: "SL PL", def: false },
];
const blockKey = (k: string) => `infoBlocks_${k}_visible`;

/** Account currencies offered (catalog: "Default (NONE) + available currencies"). */
const CURRENCIES = ["NONE", "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "BTC", "USDT"];

const STOP_BG = catalogColor("rgba(242, 54, 69, 0.2)");
const PROFIT_BG = catalogColor("rgba(8, 153, 129, 0.2)");

const num = (v: unknown): number | undefined => (v === undefined || v === null || v === "" || !isFinite(Number(v)) ? undefined : Number(v));

/** Tick size of a position: stored with the first handle drag, else from the entry price. */
export function positionTick(d: Drawing): number {
  return num(d.props?.tickSize) ?? tickSizeFor(d.anchors[0]?.price ?? 0);
}

/** Entry / stop / target of a position drawing (overrides → tick distances → creation defaults). */
export function positionLevels(d: Drawing, side: PositionSide): PositionLevels {
  const [a, b] = d.anchors;
  const entry = num(d.props?.entryPrice) ?? a?.price ?? 0;
  const tick = positionTick(d);
  let hint = b ? ticksIn((b.price ?? entry) - (a?.price ?? entry), tick) : 0;
  if (hint <= 0) hint = Math.max(1, ticksIn(entry * 0.01, tick));
  const profitTicks = num(d.props?.profitLevel) ?? hint;
  const stopTicks = num(d.props?.stopLevel) ?? profitTicks;
  const base = positionPrices(side, entry, stopTicks, profitTicks, tick);
  return { entry, stop: num(d.props?.stopPrice) ?? base.stop, target: num(d.props?.profitPrice) ?? base.target };
}

export function positionInputs(d: Drawing): PositionInputs {
  const p = String(prop(d, "qtyPrecision", "default"));
  return {
    accountSize: numProp(d, "accountSize", 1000),
    risk: numProp(d, "risk", 25),
    riskMode: prop(d, "riskDisplayMode", "percents") === "money" ? "money" : "percents",
    lotSize: numProp(d, "lotSize", 1),
    qtyPrecision: p === "default" ? "default" : Number(p),
  };
}

export function positionStatsOf(d: Drawing, side: PositionSide): PositionStats {
  return positionStats(side, positionLevels(d, side), positionInputs(d), positionTick(d));
}

const on = (d: Drawing, k: string, def = true) => prop(d, blockKey(k), def) !== false;
const cur = (d: Drawing) => {
  const c = String(prop(d, "currency", "NONE"));
  return c === "NONE" ? "" : ` ${c}`;
};

/** Target / stop label lines (info blocks; compact mode joins them on one line). */
function levelLabel(d: Drawing, st: PositionStats, which: "tp" | "sl", fp: (v: number) => string): string[] {
  const tp = which === "tp";
  const parts: string[] = [];
  if (on(d, `${which}PriceOffset`)) parts.push(fp(tp ? st.tpPrice : st.slPrice));
  if (on(d, `${which}PercentOffset`)) parts.push(`(${fmtNum(tp ? st.tpPercent : st.slPercent)}%)`);
  if (on(d, `${which}TickOffset`)) parts.push(`${tp ? st.tpTicks : st.slTicks}`);
  const amount: string[] = [];
  if (on(d, `${which}Amount`)) amount.push(`Amount: ${fmtNum(tp ? st.tpAmount : st.slAmount)}${cur(d)}`);
  const acct = positionInputs(d).accountSize;
  if (on(d, `${which}PL`, false)) amount.push(`P&L: ${tp ? "+" : "−"}${fmtNum((((tp ? st.tpAmount : st.slAmount) / (acct || 1)) * 100))}%`);
  const head = `${tp ? "Target" : "Stop"}: ${parts.join(" ")}`.trim();
  if (prop(d, "compact", false)) return [parts.length ? `${tp ? "TP" : "SL"} ${parts[0]}` : ""];
  return [parts.length ? head : "", ...amount];
}

/** Center label: open / closed P&L, quantity, risk/reward. */
function centerLabel(d: Drawing, st: PositionStats, pl: { closed: boolean; amount: number }): string[] {
  const compact = prop(d, "compact", false);
  const out: string[] = [];
  if (on(d, "openClosePL")) out.push(`${pl.closed ? "Closed" : "Open"} P&L: ${fmtNum(pl.amount)}${cur(d)}`);
  const qtyDec = st.qty % 1 === 0 ? 0 : Math.min(10, String(st.qty).split(".")[1]?.length ?? 2);
  if (on(d, "qty")) out.push(`Qty: ${fmtNum(st.qty, qtyDec)}`);
  if (on(d, "riskRewardRatio")) out.push(`${compact ? "R:R" : "Risk/Reward Ratio:"} ${fmtNum(st.riskReward)}`);
  return compact ? [out.join("  ")] : out;
}

function geometry(d: Drawing, g: ToolGeom, side: PositionSide) {
  const [a, b] = d.anchors;
  const lv = positionLevels(d, side);
  const x0 = g.toPx(a).x;
  const x1 = b ? g.toPx(b).x : x0 + 80;
  const y = (p: number) => g.toPx({ time: a.time, price: p }).y;
  return { lv, x0, x1, yE: y(lv.entry), yS: y(lv.stop), yT: y(lv.target) };
}

function render(side: PositionSide) {
  return (c: DrawCtx, d: Drawing): void => {
    const [a] = d.anchors;
    if (!a) return;
    const { ctx } = c;
    const { lv, x0, x1, yE, yS, yT } = geometry(d, c, side);
    const left = Math.min(x0, x1);
    const w = Math.max(1, Math.abs(x1 - x0));
    const profitBg = String(prop(d, "profitBackground", PROFIT_BG));
    const stopBg = String(prop(d, "stopBackground", STOP_BG));
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = profitBg;
    ctx.fillRect(left, Math.min(yE, yT), w, Math.abs(yT - yE));
    ctx.fillStyle = stopBg;
    ctx.fillRect(left, Math.min(yE, yS), w, Math.abs(yS - yE));
    ctx.restore();
    line(ctx, { x: left, y: yE }, { x: left + w, y: yE });

    // Outcome: path from the entry to the exit (closed) or the last close (open).
    const outcome = positionOutcome(side, lv, c.bars, a.time, d.anchors[1]?.time ?? a.time);
    const st = positionStatsOf(d, side);
    if (outcome.status !== "pending") {
      const bar = c.bars[outcome.index];
      const pe = c.toPx({ time: bar.time, price: outcome.price });
      ctx.save();
      ctx.setLineDash([4, 3]);
      line(ctx, { x: x0, y: yE }, pe);
      ctx.restore();
    }

    const fp = (v: number) => formatPrice(v, c.priceDecimals);
    const size = Number(d.style?.textSize ?? 12);
    const color = d.style?.textColor ?? "#ffffff";
    const cx = left + w / 2;
    if (prop(d, "showPriceLabels", true)) {
      ctx.save();
      ctx.globalAlpha = 1;
      for (const [yy, p, bg] of [
        [yT, lv.target, profitBg],
        [yE, lv.entry, c.color],
        [yS, lv.stop, stopBg],
      ] as [number, number, string][]) {
        labelBox(c, [fp(p)], left + w + 4, yy, { color, size: Math.max(8, size - 2), background: solid(bg), align: "left" });
      }
      ctx.restore();
    }
    if (!(c.selected || c.hovered || prop(d, "alwaysShowStats", false))) return;
    const above = (yy: number, other: number) => (yy <= other ? yy - size : yy + size);
    const pl = { closed: outcome.status === "target" || outcome.status === "stop", amount: outcome.change * st.units };
    labelBox(c, levelLabel(d, st, "tp", fp), cx, above(yT, yE), { color, size, background: solid(profitBg) });
    labelBox(c, levelLabel(d, st, "sl", fp), cx, above(yS, yE), { color, size, background: solid(stopBg) });
    labelBox(c, centerLabel(d, st, pl), cx, yE + (yS > yE ? -size : size), { color, size, background: solid(pl.amount >= 0 ? profitBg : stopBg) });
  };
}

/** Handles: entry (left edge), target edge, stop edge, right edge. */
function handles(side: PositionSide) {
  return (d: Drawing, g: ToolGeom) => {
    if (!d.anchors[0]) return [];
    const { x0, x1, yE, yS, yT } = geometry(d, g, side);
    return [
      { x: x0, y: yE },
      { x: x0, y: yT },
      { x: x0, y: yS },
      { x: x1, y: yE },
    ];
  };
}

function onAnchorDrag(side: PositionSide) {
  return (d: Drawing, index: number, at: { time: number; price: number }): Drawing => {
    const [a, b] = d.anchors;
    const tick = positionTick(d);
    const lv = positionLevels(d, side);
    const props: Record<string, unknown> = { ...(d.props ?? {}), tickSize: tick };
    if (index === 0) {
      // Entry: keep the stop / target distances, move start time and entry price.
      delete props.entryPrice;
      props.profitLevel = ticksIn(lv.target - lv.entry, tick);
      props.stopLevel = ticksIn(lv.entry - lv.stop, tick);
      delete props.profitPrice;
      delete props.stopPrice;
      return { ...d, props, anchors: [at, ...(b ? [{ time: Math.max(at.time, b.time), price: b.price + (at.price - a.price) }] : [])] };
    }
    if (index === 1 || index === 2) {
      const tp = index === 1;
      const s = side === "long" ? 1 : -1;
      // Keep the level on its side of the entry.
      const dist = Math.max(tick, s * (tp ? at.price - lv.entry : lv.entry - at.price));
      props[tp ? "profitLevel" : "stopLevel"] = ticksIn(dist, tick);
      if (props.profitLevel === undefined) props.profitLevel = ticksIn(lv.target - lv.entry, tick);
      if (props.stopLevel === undefined) props.stopLevel = ticksIn(lv.entry - lv.stop, tick);
      delete props[tp ? "profitPrice" : "stopPrice"];
      return { ...d, props };
    }
    // Right edge: end time only (never left of the entry).
    const end = { time: Math.max(at.time, a.time), price: b?.price ?? a.price };
    return { ...d, anchors: [a, end] };
  };
}

// ---------- derived inputs (entry / level ticks / level prices) ----------

/** Props with the current tick size and both levels frozen as tick distances (no price overrides). */
function frozen(d: Drawing, side: PositionSide): Record<string, unknown> {
  const tick = positionTick(d);
  const lv = positionLevels(d, side);
  const props: Record<string, unknown> = { ...(d.props ?? {}), tickSize: tick };
  props.profitLevel = ticksIn(lv.target - lv.entry, tick);
  props.stopLevel = ticksIn(lv.entry - lv.stop, tick);
  return props;
}

/** "Entry price": moves the entry anchor; stop / target keep their distances (and price overrides move along). */
export function setEntry(d: Drawing, side: PositionSide, price: number): Drawing {
  const [a, b] = d.anchors;
  if (!a || !Number.isFinite(price)) return d;
  const lv = positionLevels(d, side);
  const delta = price - lv.entry;
  const props = frozen(d, side);
  delete props.entryPrice;
  for (const k of ["profitPrice", "stopPrice"]) {
    const v = num(props[k]);
    if (v !== undefined) props[k] = v + delta;
  }
  const anchors = [{ ...a, price }, ...(b ? [{ ...b, price: b.price + (price - a.price) }] : [])];
  return { ...d, props, anchors };
}

/** Level "Ticks": the distance from the entry; clears that level's price. */
export function setLevelTicks(d: Drawing, side: PositionSide, level: "profit" | "stop", ticks: number): Drawing {
  if (!Number.isFinite(ticks)) return d;
  const props = frozen(d, side);
  props[`${level}Level`] = Math.max(0, Math.round(ticks));
  delete props[`${level}Price`];
  return { ...d, props };
}

/** Level "Price": stores the price; the level's ticks follow (distance from the entry). */
export function setLevelPrice(d: Drawing, side: PositionSide, level: "profit" | "stop", price: number): Drawing {
  if (!Number.isFinite(price)) return d;
  const props = frozen(d, side);
  const tick = positionTick(d);
  props[`${level}Level`] = ticksIn(price - positionLevels(d, side).entry, tick);
  props[`${level}Price`] = price;
  return { ...d, props };
}

function inputs(side: PositionSide): SettingsField[] {
  const lv = (d: Drawing) => positionLevels(d, side);
  const tick = positionTick;
  return [
    { kind: "number", key: "props.accountSize", label: "Account size", catalog: "accountSize", default: 1000, min: 1e-9, max: 1e9, step: 1, testWith: (d) => ({ ...d, props: { ...d.props, alwaysShowStats: true } }) },
    {
      kind: "select",
      key: "props.currency",
      label: "Currency",
      catalog: "currency",
      default: "NONE",
      options: CURRENCIES.map((c) => ({ value: c, label: c === "NONE" ? "Default" : c })),
      testWith: (d) => ({ ...d, props: { ...d.props, alwaysShowStats: true } }),
    },
    { kind: "number", key: "props.lotSize", label: "Lot size", catalog: "lotSize", default: 1, min: 1e-9, max: 1e8, step: 1, testWith: (d) => ({ ...d, props: { ...d.props, alwaysShowStats: true } }), testValue: 10 },
    { kind: "number", key: "props.risk", label: "Risk", catalog: "risk", default: 25, min: 1e-9, max: 100, step: 0.01, testWith: (d) => ({ ...d, props: { ...d.props, alwaysShowStats: true } }), testValue: 5 },
    {
      kind: "select",
      key: "props.riskDisplayMode",
      label: "Risk unit",
      catalog: "riskDisplayMode",
      default: "percents",
      options: [
        { value: "percents", label: "%" },
        { value: "money", label: "Cash (or the account currency code)" },
      ],
      testWith: (d) => ({ ...d, props: { ...d.props, alwaysShowStats: true } }),
    },
    { kind: "number", key: "props.entryPrice", label: "Entry price", catalog: "entryPrice (derived from anchor)", default: (_t: unknown, d: Drawing) => lv(d).entry, step: 0.01, get: (d) => lv(d).entry, set: (d, v) => setEntry(d, side, Number(v)) },
    { kind: "number", key: "props.leverage", label: "Leverage", catalog: "leverage", default: 10000, min: 1, max: 10000, step: 0.1, visual: false },
    { kind: "section", label: "Profit level" },
    {
      kind: "number",
      key: "props.profitLevel",
      label: "Ticks",
      catalog: "profitLevel",
      default: (_t: unknown, d: Drawing) => ticksIn(lv(d).target - lv(d).entry, tick(d)),
      min: 0,
      max: 1e9,
      step: 1,
      get: (d) => ticksIn(lv(d).target - lv(d).entry, tick(d)),
      set: (d, v) => setLevelTicks(d, side, "profit", Number(v)),
    },
    {
      kind: "number",
      key: "props.profitPrice",
      label: "Price",
      catalog: "profit price (derived)",
      default: (_t: unknown, d: Drawing) => lv(d).target,
      step: 0.01,
      get: (d) => lv(d).target,
      set: (d, v) => setLevelPrice(d, side, "profit", Number(v)),
    },
    { kind: "section", label: "Stop level" },
    {
      kind: "number",
      key: "props.stopLevel",
      label: "Ticks",
      catalog: "stopLevel",
      default: (_t: unknown, d: Drawing) => ticksIn(lv(d).entry - lv(d).stop, tick(d)),
      min: 0,
      max: 1e9,
      step: 1,
      get: (d) => ticksIn(lv(d).entry - lv(d).stop, tick(d)),
      set: (d, v) => setLevelTicks(d, side, "stop", Number(v)),
    },
    {
      kind: "number",
      key: "props.stopPrice",
      label: "Price",
      catalog: "stop price (derived)",
      default: (_t: unknown, d: Drawing) => lv(d).stop,
      step: 0.01,
      get: (d) => lv(d).stop,
      set: (d, v) => setLevelPrice(d, side, "stop", Number(v)),
    },
    {
      kind: "select",
      key: "props.qtyPrecision",
      label: "QTY precision",
      catalog: "qtyPrecision",
      default: "default",
      options: [{ value: "default", label: "Default" }, { value: "0", label: "Integer" }, ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} decimal${i ? "s" : ""}` }))],
      testWith: (d) => ({ ...d, props: { ...d.props, alwaysShowStats: true, accountSize: 1234.5, risk: 3.3 } }),
      testValue: "6",
    },
  ] as SettingsField[];
}

const withStats = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, alwaysShowStats: true } });

const STYLE: SettingsField[] = [
  { kind: "color", key: "style.color", label: "Lines", catalog: "linecolor", default: "#808080" },
  { kind: "width", key: "style.width", label: "Width", catalog: "linewidth", default: 1 },
  { kind: "color", key: "props.stopBackground", label: "Stop color", catalog: "stopBackground", default: STOP_BG, alpha: true },
  { kind: "color", key: "props.profitBackground", label: "Target color", catalog: "profitBackground", default: PROFIT_BG, alpha: true },
  { kind: "color", key: "style.textColor", label: "Text", catalog: "textcolor", default: "#ffffff", testWith: withStats },
  { kind: "fontSize", key: "style.textSize", label: "Font size", catalog: "fontsize", default: 12, sizes: CATALOG_FONT_SIZES, testWith: withStats },
  { kind: "checkbox", key: "props.showPriceLabels", label: "Price labels", catalog: "showPriceLabels", default: true },
  { kind: "section", label: "Info" },
  ...INFO_BLOCKS.map((b): SettingsField => ({ kind: "checkbox", key: `props.${blockKey(b.key)}`, label: b.label, catalog: `infoBlocks.${b.key}.visible`, default: b.def, testWith: withStats })),
  { kind: "checkbox", key: "props.compact", label: "Compact stats mode", catalog: "compact", default: false, testWith: withStats },
  { kind: "checkbox", key: "props.alwaysShowStats", label: "Always show stats", catalog: "alwaysShowStats", default: false },
];

function positionTool(side: PositionSide): DrawingToolDef {
  const long = side === "long";
  return {
    type: long ? "longPosition" : "shortPosition",
    catalogType: long ? "LineToolRiskRewardLong" : "LineToolRiskRewardShort",
    family: "projection",
    section: "Forecasting",
    label: long ? "Long position" : "Short position",
    icon: long ? "longPosition" : "shortPosition",
    // Box split at the entry line; the arrow points to the profit side.
    iconPath: long ? "M4.5 5.5h19v17h-19zM4.5 15.5h19M14 12.5V7.5M11.5 10l2.5-2.5 2.5 2.5" : "M4.5 5.5h19v17h-19zM4.5 12.5h19M14 15.5v5M11.5 18l2.5 2.5 2.5-2.5",
    anchors: 2,
    // Catalog floating toolbar unknown (special case): line color + width, settings, lock, remove, more.
    floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
    defaults: { color: "#808080", width: 1, textColor: "#ffffff", textSize: 12 },
    defaultProps: {
      accountSize: 1000,
      currency: "NONE",
      lotSize: 1,
      risk: 25,
      riskDisplayMode: "percents",
      leverage: 10000,
      qtyPrecision: "default",
      stopBackground: STOP_BG,
      profitBackground: PROFIT_BG,
      stopBackgroundTransparency: 80,
      profitBackgroundTransparency: 80,
      showPriceLabels: true,
      ...Object.fromEntries(INFO_BLOCKS.map((b) => [blockKey(b.key), b.def])),
      compact: false,
      alwaysShowStats: false,
    },
    settings: { coordinates: false, inputs: inputs(side), style: STYLE, tabOrder: ["inputs", "style", "visibility"] },
    hitTest(d, g, x, y, tol) {
      if (!d.anchors[0]) return false;
      const { x0, x1, yS, yT } = geometry(d, g, side);
      return forecastInBox(x, y, { x: x0, y: yS }, { x: x1, y: yT }, tol);
    },
    render: render(side),
    handles: handles(side),
    onAnchorDrag: onAnchorDrag(side),
    bounds(d, g) {
      const { x0, x1, yS, yT } = geometry(d, g, side);
      return { x: Math.min(x0, x1), y: Math.min(yS, yT), width: Math.abs(x1 - x0), height: Math.abs(yS - yT) };
    },
    stats(d) {
      const st = positionStatsOf(d, side);
      return [`R:R ${fmtNum(st.riskReward)}`, `Qty ${st.qty}`, `Risk ${fmtNum(st.riskAmount)}`];
    },
  };
}

export const longPosition = positionTool("long");
export const shortPosition = positionTool("short");
