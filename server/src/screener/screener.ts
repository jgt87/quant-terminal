import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { IndicatorDef, ScreenerField, ScreenerFilter, ScreenerRequest, ScreenerRow } from "@qt/core";
import type { MarketData } from "../providers";
import type { Store } from "../store";
import { badRequest, notFound } from "../errors";
import { mapPool } from "../util/pool";
import { applyFilters, computeFields, coreCalc, SCREENER_FIELDS, sortRows } from "./fields";

const UNIVERSE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "universes");
const ROW_TTL_MS = 10 * 60_000;
const DAILY_BARS = 300;
const MAX_SYMBOLS = 600;

export interface Universe {
  id: string;
  name: string;
  description?: string;
  asOf?: string;
  symbols: { symbol: string; name?: string }[];
}

export interface ScreenerResponse {
  rows: ScreenerRow[];
  /** Oldest computation time (ms) among the rows served (rows are cached for 10 minutes). */
  computedAt: number;
  errors: { symbol: string; message: string }[];
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const OPS: readonly ScreenerFilter["op"][] = [">", "<", ">=", "<=", "between", "above-field", "below-field"];
const isField = (v: unknown): v is ScreenerField => SCREENER_FIELDS.includes(v as ScreenerField);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function validateScreenerRequest(body: unknown): ScreenerRequest {
  if (!isObj(body)) throw badRequest("Body must be an object");
  const universe = body.universe === undefined ? "custom" : body.universe;
  if (typeof universe !== "string" || universe.length > 100) throw badRequest("universe must be a string");
  const req: ScreenerRequest = { universe, filters: [] };
  if (body.symbols !== undefined) {
    if (!Array.isArray(body.symbols) || body.symbols.length > MAX_SYMBOLS || body.symbols.some((s) => typeof s !== "string" || !s.trim() || s.length > 64)) {
      throw badRequest(`symbols must be an array of up to ${MAX_SYMBOLS} symbols`);
    }
    req.symbols = (body.symbols as string[]).map((s) => s.trim());
  }
  if (body.filters !== undefined) {
    if (!Array.isArray(body.filters) || body.filters.length > 50) throw badRequest("filters must be an array (max 50)");
    req.filters = body.filters.map((f, i) => {
      if (!isObj(f) || !isField(f.field)) throw badRequest(`filters[${i}].field must be one of: ${SCREENER_FIELDS.join(", ")}`);
      if (!OPS.includes(f.op as ScreenerFilter["op"])) throw badRequest(`filters[${i}].op must be one of: ${OPS.join(" ")}`);
      const op = f.op as ScreenerFilter["op"];
      const out: ScreenerFilter = { field: f.field, op };
      if (op === "above-field" || op === "below-field") {
        if (!isField(f.otherField)) throw badRequest(`filters[${i}].otherField is required for ${op}`);
        out.otherField = f.otherField;
      } else {
        if (!finite(f.value)) throw badRequest(`filters[${i}].value must be a number`);
        out.value = f.value;
        if (op === "between") {
          if (!finite(f.value2)) throw badRequest(`filters[${i}].value2 must be a number`);
          out.value2 = f.value2;
        }
      }
      return out;
    });
  }
  if (body.sort !== undefined) {
    if (!isObj(body.sort) || !isField(body.sort.field) || (body.sort.dir !== "asc" && body.sort.dir !== "desc")) {
      throw badRequest("sort must be {field, dir: asc|desc}");
    }
    req.sort = { field: body.sort.field, dir: body.sort.dir };
  }
  if (body.columns !== undefined) {
    if (!Array.isArray(body.columns) || !body.columns.every(isField)) throw badRequest("columns must be screener fields");
    req.columns = body.columns as ScreenerField[];
  }
  return req;
}

/** Screener over built-in universes, watchlists or an explicit symbol list, on cached daily bars. */
export class Screener {
  private rows = new Map<string, { at: number; row: ScreenerRow }>();
  private universesCache: Universe[] | null = null;

  constructor(
    private readonly market: MarketData,
    private readonly store: Store,
    private readonly loadCore: () => Promise<{ getIndicator(id: string): IndicatorDef | undefined }> = async () => import("@qt/core"),
    private readonly now: () => number = Date.now,
  ) {}

  async builtInUniverses(): Promise<Universe[]> {
    if (this.universesCache) return this.universesCache;
    const files = (await readdir(UNIVERSE_DIR)).filter((f) => f.endsWith(".json")).sort();
    const list: Universe[] = [];
    for (const f of files) list.push(JSON.parse(await readFile(path.join(UNIVERSE_DIR, f), "utf8")) as Universe);
    this.universesCache = list;
    return list;
  }

  /** Built-in universes plus one `watchlist:<id>` entry per user watchlist. */
  async universes(): Promise<(Omit<Universe, "symbols"> & { count: number; symbols: string[] })[]> {
    const builtIn = (await this.builtInUniverses()).map((u) => ({ ...u, count: u.symbols.length, symbols: u.symbols.map((s) => s.symbol) }));
    const lists = await this.store.getWatchlists();
    const wl = lists.map((w) => ({ id: `watchlist:${w.id}`, name: `Watchlist: ${w.name}`, count: w.symbols.length, symbols: w.symbols }));
    return [...builtIn, ...wl];
  }

  async resolveUniverse(req: ScreenerRequest): Promise<{ symbol: string; name?: string }[]> {
    if (req.symbols?.length) return req.symbols.map((symbol) => ({ symbol }));
    if (req.universe.startsWith("watchlist:")) {
      const id = req.universe.slice("watchlist:".length);
      const w = (await this.store.getWatchlists()).find((x) => x.id === id);
      if (!w) throw notFound(`Watchlist not found: ${id}`);
      return w.symbols.map((symbol) => ({ symbol }));
    }
    const u = (await this.builtInUniverses()).find((x) => x.id === req.universe);
    if (!u) throw notFound(`Unknown universe: ${req.universe}`);
    return u.symbols;
  }

  async run(req: ScreenerRequest): Promise<ScreenerResponse> {
    const members = (await this.resolveUniverse(req)).slice(0, MAX_SYMBOLS);
    const core = await this.loadCore();
    const calc = coreCalc(core.getIndicator);
    const errors: ScreenerResponse["errors"] = [];
    const now = this.now();
    let oldest = now;
    const computed = await mapPool(members, 4, async (m) => {
      const key = m.symbol.toUpperCase();
      const hit = this.rows.get(key);
      if (hit && now - hit.at < ROW_TTL_MS) {
        oldest = Math.min(oldest, hit.at);
        return { ...hit.row, symbol: m.symbol };
      }
      try {
        const res = await this.market.bars(m.symbol, "1D", undefined, DAILY_BARS);
        if (res.bars.length === 0) throw new Error("No daily bars");
        const row: ScreenerRow = { symbol: m.symbol, name: res.symbol.name || m.name || m.symbol, values: computeFields(res.bars, calc) };
        this.rows.set(key, { at: now, row });
        return row;
      } catch (err) {
        errors.push({ symbol: m.symbol, message: (err as Error).message });
        return null;
      }
    });
    let rows = computed.filter((r): r is ScreenerRow => r !== null);
    rows = sortRows(applyFilters(rows, req.filters ?? []), req.sort);
    if (req.columns?.length) {
      const keep = new Set<ScreenerField>(req.columns);
      rows = rows.map((r) => ({ ...r, values: Object.fromEntries(Object.entries(r.values).filter(([k]) => keep.has(k as ScreenerField))) }));
    }
    return { rows, computedAt: oldest, errors };
  }
}
