import type { ChartType, FlagColor, Layout, Watchlist } from "@qt/core";
import { badRequest } from "./errors";
import { ID_RE } from "./store";
import { parseInterval } from "./bars";

// Same list as FLAG_COLORS in core/types.ts (kept local: the server loads core lazily).
const FLAG_COLORS: readonly FlagColor[] = ["red", "orange", "yellow", "green", "cyan", "blue", "purple"];
const CHART_TYPES: readonly ChartType[] = [
  "candles",
  "hollow",
  "bars",
  "line",
  "area",
  "heikin-ashi",
  "baseline",
  "columns",
  "renko",
  "kagi",
  "linebreak",
  "pnf",
  "range",
];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max: number) => typeof v === "string" && v.length <= max;

export function validateWatchlists(body: unknown): Watchlist[] {
  if (!Array.isArray(body)) throw badRequest("Expected an array of watchlists");
  if (body.length > 100) throw badRequest("Too many watchlists (max 100)");
  const ids = new Set<string>();
  return body.map((w, i) => {
    if (!isObj(w)) throw badRequest(`watchlists[${i}] must be an object`);
    if (typeof w.id !== "string" || !ID_RE.test(w.id)) throw badRequest(`watchlists[${i}].id is invalid`);
    if (ids.has(w.id)) throw badRequest(`Duplicate watchlist id: ${w.id}`);
    ids.add(w.id);
    if (!str(w.name, 100)) throw badRequest(`watchlists[${i}].name must be a string (max 100)`);
    if (!Array.isArray(w.symbols) || w.symbols.length > 1000) throw badRequest(`watchlists[${i}].symbols must be an array (max 1000)`);
    for (const s of w.symbols) {
      if (typeof s !== "string" || !s.trim() || s.length > 64) throw badRequest(`watchlists[${i}].symbols contains an invalid symbol`);
    }
    const out: Watchlist = { id: w.id, name: w.name as string, symbols: (w.symbols as string[]).map((s) => s.trim()) };
    // Optional flag colors per symbol; flags of symbols no longer in the list are dropped.
    if (w.flags !== undefined && w.flags !== null) {
      if (!isObj(w.flags)) throw badRequest(`watchlists[${i}].flags must be an object of symbol -> color`);
      const inList = new Set(out.symbols);
      const flags: Record<string, FlagColor> = {};
      for (const [sym, color] of Object.entries(w.flags)) {
        if (!FLAG_COLORS.includes(color as FlagColor)) throw badRequest(`watchlists[${i}].flags.${sym} must be one of: ${FLAG_COLORS.join(", ")}`);
        if (inList.has(sym)) flags[sym] = color as FlagColor;
      }
      if (Object.keys(flags).length) out.flags = flags;
    }
    return out;
  });
}

/** Validate a layout body for `id`; stamps updatedAt (ms since epoch). */
export function validateLayout(id: string, body: unknown, now = Date.now()): Layout {
  if (!isObj(body)) throw badRequest("Layout must be an object");
  if (body.id !== undefined && body.id !== id) throw badRequest("Layout id does not match the URL");
  if (!str(body.name, 200)) throw badRequest("layout.name must be a string (max 200)");
  if (!str(body.symbol, 64) || !(body.symbol as string)) throw badRequest("layout.symbol must be a non-empty string");
  const interval = parseInterval(body.interval as string);
  if (!interval || interval !== body.interval) throw badRequest("layout.interval is invalid");
  if (!CHART_TYPES.includes(body.chartType as ChartType)) throw badRequest("layout.chartType is invalid");
  if (typeof body.logScale !== "boolean") throw badRequest("layout.logScale must be a boolean");
  if (!Array.isArray(body.indicators)) throw badRequest("layout.indicators must be an array");
  for (const ind of body.indicators) {
    if (!isObj(ind) || typeof ind.uid !== "string" || typeof ind.indicatorId !== "string" || !isObj(ind.inputs)) {
      throw badRequest("layout.indicators contains an invalid entry");
    }
  }
  if (!isObj(body.drawings)) throw badRequest("layout.drawings must be an object keyed by symbol");
  for (const [sym, list] of Object.entries(body.drawings)) {
    if (!Array.isArray(list)) throw badRequest(`layout.drawings[${sym}] must be an array`);
    for (const d of list) {
      if (!isObj(d) || typeof d.id !== "string" || typeof d.type !== "string" || !Array.isArray(d.anchors)) {
        throw badRequest(`layout.drawings[${sym}] contains an invalid drawing`);
      }
      // Optional registry-era fields (freehand/poly points, tool props, groups, order, template).
      if (
        (d.points !== undefined && (!Array.isArray(d.points) || d.points.length > 5000)) ||
        (d.props !== undefined && !isObj(d.props)) ||
        (d.groupId !== undefined && !str(d.groupId, 64)) ||
        (d.zIndex !== undefined && (typeof d.zIndex !== "number" || !Number.isFinite(d.zIndex))) ||
        (d.templateName !== undefined && !str(d.templateName, 80)) ||
        (d.name !== undefined && !str(d.name, 120))
      ) {
        throw badRequest(`layout.drawings[${sym}] drawing ${d.id} has an invalid optional field`);
      }
    }
  }
  if (body.groups !== undefined) {
    if (!Array.isArray(body.groups) || body.groups.length > 500) throw badRequest("layout.groups must be an array (max 500)");
    for (const g of body.groups) {
      if (!isObj(g) || !str(g.id, 64) || !g.id || !str(g.name, 120) || !str(g.symbol, 64)) throw badRequest("layout.groups contains an invalid group");
    }
  }
  if (body.paneRatios !== undefined) {
    if (!isObj(body.paneRatios) || Object.keys(body.paneRatios).length > 100) throw badRequest("layout.paneRatios must be an object (max 100 entries)");
    for (const v of Object.values(body.paneRatios)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 100) throw badRequest("layout.paneRatios values must be positive numbers");
    }
  }
  if (body.chartSettings !== undefined && !isObj(body.chartSettings)) throw badRequest("layout.chartSettings must be an object");
  const { baseUpdatedAt: _base, ...rest } = body;
  return { ...(rest as unknown as Layout), id, interval, updatedAt: now };
}

/** Optional optimistic-concurrency token of a layout PUT: the updatedAt the client started from. */
export function layoutBase(body: unknown): number | undefined {
  if (!isObj(body) || body.baseUpdatedAt === undefined || body.baseUpdatedAt === null) return undefined;
  if (typeof body.baseUpdatedAt !== "number" || !Number.isFinite(body.baseUpdatedAt)) throw badRequest("baseUpdatedAt must be a number");
  return body.baseUpdatedAt;
}
