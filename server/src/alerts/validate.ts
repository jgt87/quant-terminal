import { FLOW_EVENT_KINDS, type Alert, type AlertCondition, type AlertOperand, type AlertOperator, type FlowEventKind, type IndicatorDef } from "@qt/core";
import { badRequest } from "../errors";
import { parseInterval } from "../bars";
import { ID_RE } from "../store";
import { checkWebhookUrlSyntax } from "./webhook";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const OPERATORS: readonly AlertOperator[] = [
  "crosses", "crosses-up", "crosses-down", "greater", "less", "enters-channel", "exits-channel", "moving-up-pct", "moving-down-pct",
];
const TRIGGERS: readonly Alert["trigger"][] = ["once", "once-per-bar", "once-per-bar-close", "every-time"];
const SOURCES = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];

export type IndicatorLookup = (id: string) => IndicatorDef | undefined;

function validateOperand(v: unknown, where: string, getIndicator: IndicatorLookup, alertLayoutId: string | undefined): AlertOperand {
  if (!isObj(v)) throw badRequest(`${where} must be an object`);
  switch (v.kind) {
    case "price": {
      if (v.field !== undefined && !["close", "high", "low"].includes(v.field as string)) throw badRequest(`${where}.field must be close, high or low`);
      return v.field === undefined ? { kind: "price" } : { kind: "price", field: v.field as "close" | "high" | "low" };
    }
    case "value":
      if (!finite(v.value)) throw badRequest(`${where}.value must be a finite number`);
      return { kind: "value", value: v.value };
    case "indicator": {
      if (typeof v.indicatorId !== "string") throw badRequest(`${where}.indicatorId is required`);
      const def = getIndicator(v.indicatorId);
      if (!def) throw badRequest(`${where}: unknown indicator ${v.indicatorId}`);
      const inputs = v.inputs === undefined ? {} : v.inputs;
      if (!isObj(inputs)) throw badRequest(`${where}.inputs must be an object`);
      const clean: Record<string, number | string | boolean> = {};
      for (const [key, val] of Object.entries(inputs)) {
        const inp = def.inputs.find((d) => d.key === key);
        if (!inp) throw badRequest(`${where}.inputs.${key} is not an input of ${def.id}`);
        if (inp.type === "int" || inp.type === "float") {
          if (!finite(val)) throw badRequest(`${where}.inputs.${key} must be a number`);
          if (inp.type === "int" && !Number.isInteger(val)) throw badRequest(`${where}.inputs.${key} must be an integer`);
          if ((inp.min !== undefined && val < inp.min) || (inp.max !== undefined && val > inp.max)) {
            throw badRequest(`${where}.inputs.${key} is out of range`);
          }
        } else if (inp.type === "source") {
          if (typeof val !== "string" || !SOURCES.includes(val)) throw badRequest(`${where}.inputs.${key} must be a price source`);
        } else if (typeof val !== "boolean") {
          throw badRequest(`${where}.inputs.${key} must be a boolean`);
        }
        clean[key] = val as number | string | boolean;
      }
      const output = v.output === undefined && def.outputs.length === 1 ? def.outputs[0].key : v.output;
      if (typeof output !== "string" || !def.outputs.some((o) => o.key === output)) {
        throw badRequest(`${where}.output must be one of: ${def.outputs.map((o) => o.key).join(", ")}`);
      }
      return { kind: "indicator", indicatorId: def.id, inputs: clean, output };
    }
    case "drawing": {
      if (typeof v.drawingId !== "string" || !v.drawingId || v.drawingId.length > 128) throw badRequest(`${where}.drawingId is required`);
      if (v.layoutId !== undefined && (typeof v.layoutId !== "string" || !ID_RE.test(v.layoutId))) throw badRequest(`${where}.layoutId is invalid`);
      const layoutId = (v.layoutId as string | undefined) ?? alertLayoutId;
      if (!layoutId) throw badRequest(`${where}: a drawing operand needs layoutId (on the operand or the alert)`);
      return v.layoutId === undefined ? { kind: "drawing", drawingId: v.drawingId } : { kind: "drawing", drawingId: v.drawingId, layoutId: v.layoutId as string };
    }
    case "orderflow":
      if (typeof v.event !== "string" || !(FLOW_EVENT_KINDS as readonly string[]).includes(v.event)) throw badRequest(`${where}.event must be one of: ${FLOW_EVENT_KINDS.join(", ")}`);
      return { kind: "orderflow", event: v.event as FlowEventKind };
    default:
      throw badRequest(`${where}.kind must be price, value, indicator, drawing or orderflow`);
  }
}

function validateCondition(v: unknown, i: number, getIndicator: IndicatorLookup, layoutId: string | undefined): AlertCondition {
  const where = `conditions[${i}]`;
  if (!isObj(v)) throw badRequest(`${where} must be an object`);
  if (!OPERATORS.includes(v.op as AlertOperator)) throw badRequest(`${where}.op must be one of: ${OPERATORS.join(", ")}`);
  const op = v.op as AlertOperator;
  const left = validateOperand(v.left, `${where}.left`, getIndicator, layoutId);
  const movingPct = op === "moving-up-pct" || op === "moving-down-pct";
  // The right operand is not used by moving-%; default it so clients may omit it.
  const right = movingPct && v.right === undefined ? ({ kind: "value", value: 0 } as AlertOperand) : validateOperand(v.right, `${where}.right`, getIndicator, layoutId);
  if (left.kind === "drawing") throw badRequest(`${where}.left cannot be a drawing (put the drawing on the right)`);
  const cond: AlertCondition = { left, op, right };
  if (op === "enters-channel" || op === "exits-channel") {
    if (right.kind !== "drawing") throw badRequest(`${where}: ${op} needs a channel/rectangle drawing on the right`);
  }
  if (movingPct) {
    if (!finite(v.pct) || v.pct <= 0 || v.pct > 10_000) throw badRequest(`${where}.pct must be a positive number`);
    const bars = v.bars === undefined ? 1 : v.bars;
    if (!Number.isInteger(bars) || (bars as number) < 1 || (bars as number) > 1000) throw badRequest(`${where}.bars must be an integer 1..1000`);
    cond.pct = v.pct;
    cond.bars = bars as number;
  }
  return cond;
}

/**
 * Validate an alert body. `existing` supplies id/createdAt (and the fields a partial update
 * leaves out); new alerts get them from `id`/`now`.
 */
export function validateAlert(body: unknown, opts: { id: string; now: number; existing?: Alert; getIndicator: IndicatorLookup }): Alert {
  if (!isObj(body)) throw badRequest("Alert must be an object");
  const merged: Record<string, unknown> = { ...(opts.existing ?? {}), ...body };
  const symbol = merged.symbol;
  if (typeof symbol !== "string" || !symbol.trim() || symbol.length > 64) throw badRequest("symbol is required (max 64)");
  const interval = parseInterval(typeof merged.interval === "string" ? merged.interval : "1D");
  if (!interval) throw badRequest("interval is invalid");
  const name = merged.name === undefined ? "" : merged.name;
  if (typeof name !== "string" || name.length > 200) throw badRequest("name must be a string (max 200)");
  const message = merged.message === undefined ? "" : merged.message;
  if (typeof message !== "string" || message.length > 2000) throw badRequest("message must be a string (max 2000)");
  const trigger = merged.trigger === undefined ? "once" : merged.trigger;
  if (!TRIGGERS.includes(trigger as Alert["trigger"])) throw badRequest(`trigger must be one of: ${TRIGGERS.join(", ")}`);
  const active = merged.active === undefined ? true : merged.active;
  if (typeof active !== "boolean") throw badRequest("active must be a boolean");
  if (merged.expiresAt !== undefined && merged.expiresAt !== null && !finite(merged.expiresAt)) throw badRequest("expiresAt must be a timestamp in ms");
  if (merged.layoutId !== undefined && merged.layoutId !== null && (typeof merged.layoutId !== "string" || !ID_RE.test(merged.layoutId))) {
    throw badRequest("layoutId is invalid");
  }
  const layoutId = (merged.layoutId ?? undefined) as string | undefined;
  if (!Array.isArray(merged.conditions) || merged.conditions.length < 1 || merged.conditions.length > 20) {
    throw badRequest("conditions must be an array of 1 to 20 conditions");
  }
  const conditions = merged.conditions.map((c, i) => validateCondition(c, i, opts.getIndicator, layoutId));

  const notifyRaw = merged.notify === undefined ? { browser: true } : merged.notify;
  if (!isObj(notifyRaw)) throw badRequest("notify must be an object");
  const notify: Alert["notify"] = { browser: notifyRaw.browser === undefined ? true : Boolean(notifyRaw.browser) };
  if (typeof notifyRaw.browser !== "undefined" && typeof notifyRaw.browser !== "boolean") throw badRequest("notify.browser must be a boolean");
  if (notifyRaw.sound !== undefined && notifyRaw.sound !== null) {
    if (typeof notifyRaw.sound !== "string" || notifyRaw.sound.length > 200) throw badRequest("notify.sound must be a string");
    notify.sound = notifyRaw.sound;
  }
  if (notifyRaw.webhookUrl !== undefined && notifyRaw.webhookUrl !== null && notifyRaw.webhookUrl !== "") {
    if (typeof notifyRaw.webhookUrl !== "string") throw badRequest("notify.webhookUrl must be a string");
    const err = checkWebhookUrlSyntax(notifyRaw.webhookUrl);
    if (err) throw badRequest(`notify.webhookUrl: ${err}`);
    notify.webhookUrl = notifyRaw.webhookUrl;
  }

  const alert: Alert = {
    id: opts.existing?.id ?? opts.id,
    name,
    symbol: symbol.trim(),
    interval,
    conditions,
    trigger: trigger as Alert["trigger"],
    active,
    message,
    notify,
    createdAt: opts.existing?.createdAt ?? opts.now,
  };
  if (finite(merged.expiresAt)) alert.expiresAt = merged.expiresAt;
  if (layoutId) alert.layoutId = layoutId;
  if (opts.existing?.lastFiredAt !== undefined) alert.lastFiredAt = opts.existing.lastFiredAt;
  return alert;
}

/** Layout id each drawing operand of an alert refers to. */
export function drawingRefs(alert: Alert): { layoutId: string; drawingId: string }[] {
  const out: { layoutId: string; drawingId: string }[] = [];
  for (const c of alert.conditions) {
    for (const op of [c.left, c.right]) {
      if (op.kind === "drawing") out.push({ layoutId: op.layoutId ?? alert.layoutId ?? "", drawingId: op.drawingId });
    }
  }
  return out;
}
