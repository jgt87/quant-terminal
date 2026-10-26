// Pure alert-builder model: the editable draft (text fields as typed), conversion to the
// server's Alert JSON with validation messages, the reverse, chart presets and message templating.

import { ALERT_BAND_TYPES, alertOperatorsFor, defaultAlertOperator, drawingAlertKind, type Alert, type AlertCondition, type AlertOperand, type AlertOperator, type Drawing, type DrawingType, type IndicatorDef, type Interval } from "@qt/core";
import { formatPrice } from "../../chart/format";
import options from "./alertOptions.json";

export type OperandKind = AlertOperand["kind"];

export interface OperandDraft {
  kind: OperandKind;
  field: "close" | "high" | "low";
  /** Number as typed (kind "value"). */
  value: string;
  indicatorId: string;
  inputs: Record<string, number | string | boolean>;
  output: string;
  drawingId: string;
  /** Layout of the drawing; empty = the alert's layout. */
  layoutId: string;
}

export interface ConditionDraft {
  left: OperandDraft;
  op: AlertOperator;
  right: OperandDraft;
  pct: string;
  bars: string;
}

export interface AlertDraft {
  /** Set when editing an existing alert. */
  id?: string;
  name: string;
  symbol: string;
  interval: Interval;
  conditions: ConditionDraft[];
  trigger: Alert["trigger"];
  /** datetime-local text ("" = never). */
  expires: string;
  message: string;
  active: boolean;
  browser: boolean;
  sound: string;
  webhookUrl: string;
  layoutId: string;
}

export type AlertJson = Omit<Alert, "id" | "createdAt" | "lastFiredAt">;

export const isMovingPct = (op: AlertOperator) => op === "moving-up-pct" || op === "moving-down-pct";
export const isChannelOp = (op: AlertOperator) => op === "enters-channel" || op === "exits-channel";

export function emptyOperand(kind: OperandKind = "price"): OperandDraft {
  return { kind, field: "close", value: "", indicatorId: "", inputs: {}, output: "", drawingId: "", layoutId: "" };
}

export function newCondition(price?: number | null): ConditionDraft {
  const right = emptyOperand("value");
  if (price !== undefined && price !== null && Number.isFinite(price)) right.value = String(price);
  return { left: emptyOperand("price"), op: "crosses", right, pct: "", bars: "1" };
}

export function newDraft(symbol: string, interval: Interval, price?: number | null, layoutId = ""): AlertDraft {
  return {
    name: "",
    symbol,
    interval,
    conditions: [newCondition(price)],
    trigger: "once",
    expires: "",
    message: options.defaultMessage,
    active: true,
    browser: true,
    sound: "chime",
    webhookUrl: "",
    layoutId,
  };
}

/** Indicator operand defaults: the definition's default inputs and its first output. */
export function indicatorOperand(def: IndicatorDef, base: OperandDraft = emptyOperand("indicator")): OperandDraft {
  const inputs: Record<string, number | string | boolean> = {};
  for (const i of def.inputs) inputs[i.key] = i.default;
  return { ...base, kind: "indicator", indicatorId: def.id, inputs, output: def.outputs[0]?.key ?? "" };
}

const num = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
};

function operandJson(d: OperandDraft, where: string, errors: string[]): AlertOperand {
  switch (d.kind) {
    case "price":
      return d.field === "close" ? { kind: "price" } : { kind: "price", field: d.field };
    case "value": {
      const v = num(d.value);
      if (v === null) errors.push(`${where}: enter a number`);
      return { kind: "value", value: v ?? 0 };
    }
    case "indicator":
      if (!d.indicatorId) errors.push(`${where}: choose an indicator`);
      return { kind: "indicator", indicatorId: d.indicatorId, inputs: { ...d.inputs }, output: d.output };
    case "drawing":
      if (!d.drawingId) errors.push(`${where}: choose a drawing`);
      return d.layoutId ? { kind: "drawing", drawingId: d.drawingId, layoutId: d.layoutId } : { kind: "drawing", drawingId: d.drawingId };
  }
}

export function conditionJson(c: ConditionDraft, n: number, errors: string[]): AlertCondition {
  const where = `Condition ${n}`;
  const left = operandJson(c.left, `${where} (left)`, errors);
  if (c.left.kind === "drawing") errors.push(`${where}: a drawing can only be on the right side`);
  if (isMovingPct(c.op)) {
    const pct = num(c.pct);
    const bars = num(c.bars) ?? 1;
    if (pct === null || pct <= 0) errors.push(`${where}: percent must be a positive number`);
    if (!Number.isInteger(bars) || bars < 1 || bars > 1000) errors.push(`${where}: bars must be a whole number 1..1000`);
    return { left, op: c.op, right: { kind: "value", value: 0 }, pct: pct ?? 0, bars };
  }
  const right = operandJson(c.right, `${where} (right)`, errors);
  if (isChannelOp(c.op) && c.right.kind !== "drawing") errors.push(`${where}: channel operators need a channel or rectangle drawing on the right`);
  return { left, op: c.op, right };
}

/** Datetime-local text to ms (local time); null when empty or invalid. */
export function parseLocalDateTime(s: string): number | null {
  if (!s.trim()) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/** ms to datetime-local text (local time, minutes). */
export function toLocalDateTime(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Draft to the server's Alert JSON. `errors` lists everything the user must fix first. */
export function buildAlert(d: AlertDraft, now = Date.now()): { alert: AlertJson | null; errors: string[] } {
  const errors: string[] = [];
  const symbol = d.symbol.trim();
  if (!symbol) errors.push("Symbol is required");
  if (d.conditions.length === 0) errors.push("Add at least one condition");
  if (d.conditions.length > 20) errors.push("At most 20 conditions");
  const conditions = d.conditions.map((c, i) => conditionJson(c, i + 1, errors));
  let expiresAt: number | undefined;
  if (d.expires.trim()) {
    const t = parseLocalDateTime(d.expires);
    if (t === null) errors.push("Expiry is not a valid date/time");
    else if (t <= now) errors.push("Expiry must be in the future");
    else expiresAt = t;
  }
  const webhookUrl = d.webhookUrl.trim();
  if (webhookUrl && !/^https?:\/\/[^\s]+$/i.test(webhookUrl)) errors.push("Webhook URL must start with http:// or https://");
  const usesDrawing = d.conditions.some((c) => c.right.kind === "drawing" && !c.right.layoutId);
  if (usesDrawing && !d.layoutId) errors.push("Drawing conditions need the chart layout");
  const alert: AlertJson = {
    name: d.name.trim(),
    symbol,
    interval: d.interval,
    conditions,
    trigger: d.trigger,
    active: d.active,
    message: d.message,
    notify: { browser: d.browser, ...(d.sound ? { sound: d.sound } : {}), ...(webhookUrl ? { webhookUrl } : {}) },
  };
  if (expiresAt !== undefined) alert.expiresAt = expiresAt;
  if (d.layoutId) alert.layoutId = d.layoutId;
  return errors.length ? { alert: null, errors } : { alert, errors };
}

function operandDraft(o: AlertOperand): OperandDraft {
  const d = emptyOperand(o.kind);
  if (o.kind === "price") d.field = o.field ?? "close";
  else if (o.kind === "value") d.value = String(o.value);
  else if (o.kind === "indicator") Object.assign(d, { indicatorId: o.indicatorId, inputs: { ...o.inputs }, output: o.output });
  else Object.assign(d, { drawingId: o.drawingId, layoutId: o.layoutId ?? "" });
  return d;
}

export function draftFromAlert(a: Alert): AlertDraft {
  return {
    id: a.id,
    name: a.name,
    symbol: a.symbol,
    interval: a.interval,
    conditions: a.conditions.map((c) => ({
      left: operandDraft(c.left),
      op: c.op,
      right: isMovingPct(c.op) ? emptyOperand("value") : operandDraft(c.right),
      pct: c.pct !== undefined ? String(c.pct) : "",
      bars: c.bars !== undefined ? String(c.bars) : "1",
    })),
    trigger: a.trigger,
    expires: a.expiresAt ? toLocalDateTime(a.expiresAt) : "",
    message: a.message,
    active: a.active,
    browser: a.notify.browser,
    sound: a.notify.sound ?? "",
    webhookUrl: a.notify.webhookUrl ?? "",
    layoutId: a.layoutId ?? "",
  };
}

/** Copy of an alert as a new draft (no id, " (copy)" name). */
export function cloneDraft(a: Alert): AlertDraft {
  const d = draftFromAlert(a);
  delete d.id;
  d.name = `${a.name || a.symbol} (copy)`;
  return d;
}

// ---------- Chart presets ----------

/** Target of an alert created from the chart: a price, or a drawing of a saved layout. */
export type ChartAlertTarget = number | { drawingId: string; layoutId: string; type?: DrawingType };

/**
 * Drawing types whose alerts are channel (band) alerts. Derived from the one shared list in core
 * (`DRAWING_ALERTS`), which also drives the tools' "Add alert" item and the server evaluator.
 */
export const CHANNEL_TYPES: readonly DrawingType[] = ALERT_BAND_TYPES;

/** Whether a drawing type offers alerts ("Add alert on …"). */
export const alertCapable = (type: string): boolean => drawingAlertKind(type) !== undefined;

/**
 * Operators offered for a condition: with a drawing on the right, only those its shape supports
 * (lines: crossing / greater / less; Fibonacci levels: crossing; vertical line: crossing; bands:
 * entering / exiting / crossing), plus the condition's current operator; otherwise every operator.
 */
export function operatorsFor(c: Pick<ConditionDraft, "op" | "right">, drawings: readonly Drawing[]): { id: AlertOperator; label: string }[] {
  const all = options.operators as { id: AlertOperator; label: string }[];
  const type = c.right.kind === "drawing" ? drawings.find((d) => d.id === c.right.drawingId)?.type : undefined;
  const allowed = alertOperatorsFor(type);
  if (!allowed) return all;
  return all.filter((o) => allowed.includes(o.id) || o.id === c.op || isMovingPct(o.id));
}

/** Draft for "Add alert on <price>" / "Add alert on this drawing". */
export function draftFromChart(symbol: string, interval: Interval, target: ChartAlertTarget): AlertDraft {
  if (typeof target === "number") {
    const d = newDraft(symbol, interval, target);
    d.name = `${symbol} crossing ${formatPrice(target)}`;
    return d;
  }
  const d = newDraft(symbol, interval, null, target.layoutId);
  const right = { ...emptyOperand("drawing"), drawingId: target.drawingId };
  const op = defaultAlertOperator(target.type);
  const channel = isChannelOp(op);
  d.conditions = [{ left: emptyOperand("price"), op, right, pct: "", bars: "1" }];
  d.name = `${symbol} ${channel ? "entering" : "crossing"} ${target.type ?? "drawing"}`;
  return d;
}

// ---------- Messages ----------

export interface MessageVars {
  symbol: string;
  price: number;
  /** ms */
  time: number;
  name?: string;
  interval?: string;
}

/** UTC time as "YYYY-MM-DD HH:MM:SS UTC". */
export const formatAlertTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19) + " UTC";

/** Fill {{symbol}} {{price}} {{time}} {{name}} {{interval}}; unknown placeholders stay as typed. */
export function renderMessage(template: string, v: MessageVars): string {
  const values: Record<string, string> = {
    symbol: v.symbol,
    price: formatPrice(v.price),
    time: formatAlertTime(v.time),
    name: v.name ?? "",
    interval: v.interval ?? "",
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => (k in values ? values[k] : m));
}

/** Short human description of one condition (for the alert list). */
export function describeCondition(c: AlertCondition): string {
  const op = options.operators.find((o) => o.id === c.op)?.label ?? c.op;
  const side = (o: AlertOperand) =>
    o.kind === "price" ? (o.field && o.field !== "close" ? o.field : "price")
    : o.kind === "value" ? formatPrice(o.value)
    : o.kind === "indicator" ? `${o.indicatorId}(${Object.values(o.inputs).join(",")}).${o.output}`
    : "drawing";
  if (isMovingPct(c.op)) return `${side(c.left)} ${op} ${c.pct}% in ${c.bars ?? 1} bar${(c.bars ?? 1) > 1 ? "s" : ""}`;
  return `${side(c.left)} ${op.toLowerCase()} ${side(c.right)}`;
}
