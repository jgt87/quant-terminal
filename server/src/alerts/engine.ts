import { EventEmitter } from "node:events";
import type { Alert, AlertEvent, Bar, Drawing, FlowEvent, IndicatorDef, Interval, Layout } from "@qt/core";
import type { MarketData } from "../providers";
import type { Store } from "../store";
import { newId } from "../store";
import { badRequest, notFound } from "../errors";
import { barCloseTime, evaluateAlert, type AlertState, type IndicatorFn } from "./evaluate";
import { drawingRefs, validateAlert } from "./validate";
import { sendWebhook, type WebhookResult } from "./webhook";
import { mapPool } from "../util/pool";

export const ALERTS_FILE = "alerts.json";
export const EVENTS_FILE = "alert-events.json";
export const MAX_EVENTS = 1000;
const MAX_ALERTS = 2000;

export interface CoreLike {
  getIndicator(id: string): IndicatorDef | undefined;
}

export interface AlertEngineOptions {
  store: Store;
  market: MarketData;
  /** Wall clock in ms. */
  now?: () => number;
  webhook?: (url: string, payload: unknown) => Promise<WebhookResult>;
  loadCore?: () => Promise<CoreLike>;
  /** Order flow signals of the newest bars (Binance symbols); without it order flow operands fail. */
  flowEvents?: (symbol: string, interval: Interval, bars: Bar[]) => Promise<FlowEvent[]>;
}

/** The alert uses an order flow operand. */
export const usesOrderFlow = (a: Alert): boolean => a.conditions.some((c) => c.left.kind === "orderflow" || c.right.kind === "orderflow");

export interface FiredPayload {
  alert: Alert;
  event: AlertEvent;
}

/** Bars needed to warm up the indicators an alert uses (at least 300). */
export function barsNeeded(alerts: Alert[]): number {
  let max = 0;
  for (const a of alerts) {
    for (const c of a.conditions) {
      for (const op of [c.left, c.right]) {
        if (op.kind !== "indicator") continue;
        for (const v of Object.values(op.inputs)) if (typeof v === "number") max = Math.max(max, v);
      }
      if (c.bars) max = Math.max(max, c.bars);
    }
  }
  return Math.min(5000, Math.max(300, Math.ceil(max * 3 + 50)));
}

/** Copy of `bars` with the last bar updated from a live quote that falls inside it. */
export function overlayQuote(bars: Bar[], interval: Interval, quote: { last: number; time: number } | undefined): Bar[] {
  const last = bars[bars.length - 1];
  if (!last || !quote || !Number.isFinite(quote.last)) return bars;
  if (quote.time < last.time || quote.time >= barCloseTime(last.time, interval)) return bars;
  const b = { ...last, close: quote.last, high: Math.max(last.high, quote.last), low: Math.min(last.low, quote.last) };
  return [...bars.slice(0, -1), b];
}

function findDrawings(layout: Layout | undefined): Map<string, Drawing> {
  const out = new Map<string, Drawing>();
  if (!layout?.drawings) return out;
  for (const list of Object.values(layout.drawings)) for (const d of list ?? []) out.set(d.id, d);
  return out;
}

/** Alerts engine: CRUD on alerts.json, the evaluation loop, the event log and live listeners. */
export class AlertEngine extends EventEmitter {
  private readonly store: Store;
  private readonly market: MarketData;
  private readonly now: () => number;
  private readonly webhook: (url: string, payload: unknown) => Promise<WebhookResult>;
  private readonly loadCore: () => Promise<CoreLike>;
  private readonly flowSource?: AlertEngineOptions["flowEvents"];
  private states = new Map<string, AlertState>();
  private errors = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  lastTickAt = 0;
  lastTickMs = 0;

  constructor(opts: AlertEngineOptions) {
    super();
    this.setMaxListeners(100);
    this.store = opts.store;
    this.market = opts.market;
    this.now = opts.now ?? Date.now;
    this.webhook = opts.webhook ?? ((url, payload) => sendWebhook(url, payload));
    this.loadCore = opts.loadCore ?? (async () => (await import("@qt/core")) as CoreLike);
    this.flowSource = opts.flowEvents;
  }

  start(everyMs = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick().catch((e) => console.warn("[alerts] tick failed:", (e as Error).message)), everyMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status() {
    return { running: this.timer !== null, lastTickAt: this.lastTickAt, lastTickMs: this.lastTickMs, errors: Object.fromEntries(this.errors) };
  }

  // ---------- CRUD ----------

  async list(): Promise<Alert[]> {
    return (await this.store.readDoc<Alert[]>(ALERTS_FILE)) ?? [];
  }

  async get(id: string): Promise<Alert> {
    const a = (await this.list()).find((x) => x.id === id);
    if (!a) throw notFound(`Alert not found: ${id}`);
    return a;
  }

  private async checkDrawings(alert: Alert): Promise<void> {
    for (const ref of drawingRefs(alert)) {
      const layout = await this.store.getLayout(ref.layoutId).catch(() => undefined);
      if (!layout) throw badRequest(`Layout not found: ${ref.layoutId}`);
      if (!findDrawings(layout).has(ref.drawingId)) throw badRequest(`Drawing ${ref.drawingId} not found in layout ${ref.layoutId}`);
    }
  }

  async create(body: unknown): Promise<Alert> {
    const core = await this.loadCore();
    const alert = validateAlert(body, { id: newId(), now: this.now(), getIndicator: core.getIndicator });
    delete alert.lastFiredAt;
    await this.checkDrawings(alert);
    return this.store.updateDoc<Alert[], Alert>(ALERTS_FILE, (cur = []) => {
      if (cur.length >= MAX_ALERTS) throw badRequest(`Too many alerts (max ${MAX_ALERTS})`);
      return { value: [...cur, alert], result: alert };
    });
  }

  /** Partial or full update; id and createdAt are kept. Re-activating clears lastFiredAt for "once". */
  async update(id: string, body: unknown): Promise<Alert> {
    const core = await this.loadCore();
    const before = await this.get(id);
    const alert = validateAlert(body, { id, now: this.now(), existing: before, getIndicator: core.getIndicator });
    await this.checkDrawings(alert);
    this.states.delete(id);
    return this.store.updateDoc<Alert[], Alert>(ALERTS_FILE, (cur = []) => {
      const i = cur.findIndex((a) => a.id === id);
      if (i < 0) throw notFound(`Alert not found: ${id}`);
      const next = [...cur];
      next[i] = { ...alert, lastFiredAt: cur[i].lastFiredAt };
      if (next[i].lastFiredAt === undefined) delete next[i].lastFiredAt;
      return { value: next, result: next[i] };
    });
  }

  async remove(id: string): Promise<void> {
    this.states.delete(id);
    this.errors.delete(id);
    await this.store.updateDoc<Alert[], void>(ALERTS_FILE, (cur = []) => {
      if (!cur.some((a) => a.id === id)) throw notFound(`Alert not found: ${id}`);
      return { value: cur.filter((a) => a.id !== id), result: undefined };
    });
  }

  // ---------- Events ----------

  async events(since?: number, limit = MAX_EVENTS): Promise<AlertEvent[]> {
    const all = (await this.store.readDoc<AlertEvent[]>(EVENTS_FILE)) ?? [];
    const list = since === undefined ? all : all.filter((e) => e.time > since);
    return list.slice(Math.max(0, list.length - limit));
  }

  /** Mark events seen: by ids, everything up to `before` (ms), or all. Returns the count changed. */
  markSeen(sel: { ids?: string[]; before?: number; all?: boolean }): Promise<number> {
    const ids = new Set(sel.ids ?? []);
    return this.store.updateDoc<AlertEvent[], number>(EVENTS_FILE, (cur = []) => {
      let n = 0;
      const next = cur.map((e) => {
        const hit = sel.all || ids.has(e.id) || (sel.before !== undefined && e.time <= sel.before);
        if (!hit || e.seen) return e;
        n++;
        return { ...e, seen: true };
      });
      return { value: n ? next : undefined, result: n };
    });
  }

  // ---------- Loop ----------

  private async loadBars(symbol: string, interval: Interval, limit: number): Promise<Bar[]> {
    const res = await this.market.bars(symbol, interval, undefined, limit);
    const quote = (await this.market.quotes([symbol]).catch(() => []))[0];
    return overlayQuote(res.bars, interval, quote);
  }

  /** One evaluation pass over all active alerts. Returns the events fired. */
  async tick(): Promise<AlertEvent[]> {
    if (this.running) return [];
    this.running = true;
    const t0 = Date.now();
    try {
      return await this.runTick();
    } finally {
      this.running = false;
      this.lastTickAt = this.now();
      this.lastTickMs = Date.now() - t0;
    }
  }

  private async runTick(): Promise<AlertEvent[]> {
    const now = this.now();
    const alerts = (await this.list()).filter((a) => a.active);
    if (alerts.length === 0) return [];
    const core = await this.loadCore();
    const indicator: IndicatorFn = (id, inputs, output, bars) => {
      const def = core.getIndicator(id);
      if (!def) throw new Error(`Unknown indicator ${id}`);
      return def.compute(bars, inputs)[output] ?? [];
    };

    const fired: { alert: Alert; price: number; barTime: number }[] = [];
    const deactivate = new Set<string>();
    const groups = new Map<string, Alert[]>();
    for (const a of alerts) {
      if (a.expiresAt !== undefined && now >= a.expiresAt) {
        deactivate.add(a.id);
        continue;
      }
      const key = `${a.symbol.toUpperCase()}|${a.interval}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }

    const layouts = new Map<string, Promise<Layout | undefined>>();
    const layout = (id: string) => {
      let p = layouts.get(id);
      if (!p) layouts.set(id, (p = this.store.getLayout(id).catch(() => undefined)));
      return p;
    };

    await mapPool([...groups.values()], 4, async (group) => {
      const { symbol, interval } = group[0];
      let bars: Bar[];
      try {
        bars = await this.loadBars(symbol, interval, barsNeeded(group));
      } catch (err) {
        for (const a of group) this.errors.set(a.id, `Market data: ${(err as Error).message}`);
        return;
      }
      // Order flow signals, once per symbol / interval group, only when an alert needs them.
      let flowEvents: FlowEvent[] | undefined;
      let flowError: string | undefined;
      if (group.some(usesOrderFlow)) {
        if (!this.flowSource) flowError = "Order flow signals are not available";
        else {
          try {
            flowEvents = await this.flowSource(symbol, interval, bars);
          } catch (err) {
            flowError = `Order flow: ${(err as Error).message}`;
          }
        }
      }
      for (const a of group) {
        if (flowError && usesOrderFlow(a)) {
          this.errors.set(a.id, flowError);
          continue;
        }
        const drawings = new Map<string, Drawing>();
        for (const ref of drawingRefs(a)) {
          const d = findDrawings(await layout(ref.layoutId)).get(ref.drawingId);
          if (d) drawings.set(d.id, d);
        }
        let r;
        try {
          r = evaluateAlert(a, { bars, interval, now, drawings, indicator, flowEvents }, this.states.get(a.id));
        } catch (err) {
          this.errors.set(a.id, (err as Error).message);
          continue;
        }
        this.states.set(a.id, r.state);
        if (r.error) this.errors.set(a.id, r.error);
        else this.errors.delete(a.id);
        if (r.deactivate) deactivate.add(a.id);
        if (r.fired) fired.push({ alert: a, price: r.price!, barTime: r.barTime! });
      }
    });

    if (fired.length === 0 && deactivate.size === 0) return [];
    const firedIds = new Set(fired.map((f) => f.alert.id));
    const updated = await this.store.updateDoc<Alert[], Map<string, Alert>>(ALERTS_FILE, (cur = []) => {
      const byId = new Map<string, Alert>();
      const next = cur.map((a) => {
        if (!firedIds.has(a.id) && !deactivate.has(a.id)) return a;
        const b = { ...a };
        if (firedIds.has(a.id)) b.lastFiredAt = now;
        if (deactivate.has(a.id)) b.active = false;
        byId.set(b.id, b);
        return b;
      });
      return { value: next, result: byId };
    });

    // Alerts deleted while this tick ran do not produce events.
    const events: AlertEvent[] = fired
      .filter((f) => updated.has(f.alert.id))
      .map((f) => ({
        id: newId(),
        alertId: f.alert.id,
        alertName: f.alert.name || undefined,
        symbol: f.alert.symbol,
        time: now,
        barTime: f.barTime,
        price: f.price,
        message: f.alert.message || `${f.alert.name || f.alert.symbol}: alert condition met at ${f.price}`,
        seen: false,
      }));
    if (events.length === 0) return [];
    await this.store.updateDoc<AlertEvent[], void>(EVENTS_FILE, (cur = []) => {
      const next = [...cur, ...events];
      return { value: next.slice(Math.max(0, next.length - MAX_EVENTS)), result: undefined };
    });
    for (const event of events) {
      const alert = updated.get(event.alertId)!;
      this.emit("fired", { alert, event } satisfies FiredPayload);
      const url = alert.notify?.webhookUrl;
      if (url) {
        void this.webhook(url, { alert, event }).then((r) => {
          if (!r.ok) {
            this.errors.set(alert.id, `Webhook failed after ${r.attempts} attempt(s): ${r.error ?? `HTTP ${r.status}`}`);
            console.warn(`[alerts] webhook for ${alert.id} failed: ${r.error ?? r.status}`);
          }
        });
      }
    }
    return events;
  }
}
