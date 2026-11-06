// Link groups: cells with the same color share symbol (default), interval and visible time
// range per the group's toggles. Pure: the workspace applies the returned updates directly,
// and updates that came from a link never propagate again (no feedback loops).

import type { Interval, LinkColor, LinkGroup } from "@qt/core";

export const LINK_COLORS: LinkColor[] = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink", "grey"];

export interface LinkCell {
  layoutId: string;
  link?: LinkColor;
}

export interface CellValues {
  symbol: string;
  interval: Interval;
  /** Custom interval ("2h") built from `interval`, if any. */
  customInterval?: string;
}

export interface LinkChange {
  symbol?: string;
  interval?: Interval;
  /** Travels with `interval` when either side uses a custom interval (undefined clears it). */
  customInterval?: string;
}

export interface LinkUpdate {
  index: number;
  patch: LinkChange;
}

export function isLinkColor(v: unknown): v is LinkColor {
  return typeof v === "string" && (LINK_COLORS as string[]).includes(v);
}

export function defaultLinkGroup(color: LinkColor): LinkGroup {
  return { color, symbol: true, interval: false, time: false };
}

export function defaultLinkGroups(): LinkGroup[] {
  return LINK_COLORS.map(defaultLinkGroup);
}

/** One group per color, filling gaps with defaults and dropping unknown colors. */
export function normalizeLinkGroups(groups: unknown): LinkGroup[] {
  const list = Array.isArray(groups) ? (groups as Partial<LinkGroup>[]) : [];
  return LINK_COLORS.map((color) => {
    const g = list.find((x) => x && x.color === color);
    const d = defaultLinkGroup(color);
    return g ? { color, symbol: g.symbol ?? d.symbol, interval: g.interval ?? d.interval, time: g.time ?? d.time } : d;
  });
}

export function groupFor(groups: readonly LinkGroup[], color: LinkColor): LinkGroup {
  return groups.find((g) => g.color === color) ?? defaultLinkGroup(color);
}

/** What changed between two cell states (only symbol and interval are linkable). */
export function changeOf(prev: CellValues, next: CellValues): LinkChange {
  const c: LinkChange = {};
  if (prev.symbol !== next.symbol) c.symbol = next.symbol;
  if (prev.interval !== next.interval || (prev.customInterval ?? "") !== (next.customInterval ?? "")) {
    c.interval = next.interval;
    if (prev.customInterval || next.customInterval) c.customInterval = next.customInterval;
  }
  return c;
}

export function isEmptyChange(c: LinkChange): boolean {
  return c.symbol === undefined && c.interval === undefined;
}

/** Other visible cells in the same color as `source` (empty when the source is unlinked). */
export function groupMembers(cells: readonly LinkCell[], count: number, source: number): number[] {
  const color = cells[source]?.link;
  if (!color) return [];
  const out: number[] = [];
  for (let i = 0; i < Math.min(count, cells.length); i++) if (i !== source && cells[i].link === color) out.push(i);
  return out;
}

/**
 * Updates for the other cells of the source's group after the source changed. Cells already
 * showing the value are skipped, so applying the result twice is a no-op.
 */
export function linkTargets(
  cells: readonly LinkCell[],
  count: number,
  groups: readonly LinkGroup[],
  source: number,
  change: LinkChange,
  values: readonly (CellValues | null | undefined)[],
): LinkUpdate[] {
  const color = cells[source]?.link;
  if (!color || isEmptyChange(change)) return [];
  const g = groupFor(groups, color);
  const out: LinkUpdate[] = [];
  for (const i of groupMembers(cells, count, source)) {
    const cur = values[i];
    if (!cur) continue;
    const patch: LinkChange = {};
    if (g.symbol && change.symbol !== undefined && cur.symbol !== change.symbol) patch.symbol = change.symbol;
    if (g.interval && change.interval !== undefined && (cur.interval !== change.interval || (cur.customInterval ?? "") !== (change.customInterval ?? ""))) {
      patch.interval = change.interval;
      if (cur.customInterval || change.customInterval) patch.customInterval = change.customInterval;
    }
    if (!isEmptyChange(patch)) out.push({ index: i, patch });
  }
  return out;
}

/**
 * Patch for a cell joining `color`: it adopts the linked channels of the first other visible
 * cell already in that group.
 */
export function joinPatch(
  cells: readonly LinkCell[],
  count: number,
  groups: readonly LinkGroup[],
  index: number,
  color: LinkColor,
  values: readonly (CellValues | null | undefined)[],
): LinkChange {
  const g = groupFor(groups, color);
  const own = values[index];
  for (let i = 0; i < Math.min(count, cells.length); i++) {
    if (i === index || cells[i].link !== color || !values[i]) continue;
    const v = values[i]!;
    const patch: LinkChange = {};
    if (g.symbol && v.symbol !== own?.symbol) patch.symbol = v.symbol;
    if (g.interval && (v.interval !== own?.interval || (v.customInterval ?? "") !== (own?.customInterval ?? ""))) {
      patch.interval = v.interval;
      if (v.customInterval || own?.customInterval) patch.customInterval = v.customInterval;
    }
    return patch;
  }
  return {};
}

/** Cells that mirror the source's crosshair: its link group, or the whole tab when unlinked. */
export function crosshairTargets(cells: readonly LinkCell[], count: number, source: number): number[] {
  if (cells[source]?.link) return groupMembers(cells, count, source);
  const out: number[] = [];
  for (let i = 0; i < Math.min(count, cells.length); i++) if (i !== source) out.push(i);
  return out;
}

/**
 * Cells that follow the source's visible time range: every other cell of the tab with time sync
 * on, otherwise the source's link group when its time toggle is on.
 */
export function timeTargets(cells: readonly LinkCell[], count: number, groups: readonly LinkGroup[], source: number, syncAll = false): number[] {
  if (syncAll) {
    const out: number[] = [];
    for (let i = 0; i < Math.min(count, cells.length); i++) if (i !== source) out.push(i);
    return out;
  }
  const color = cells[source]?.link;
  if (!color || !groupFor(groups, color).time) return [];
  return groupMembers(cells, count, source);
}

// ---------- link values across tabs ----------
// Cells of inactive tabs are not mounted, so a linked change cannot reach them directly. The
// workspace keeps the last linked value per color (with the time it was set); a cell that mounts
// later adopts it when that value is newer than the cell's own layout.

export interface LinkValue {
  symbol?: string;
  symbolAt?: number;
  interval?: Interval;
  customInterval?: string;
  intervalAt?: number;
}

export type LinkValues = Partial<Record<LinkColor, LinkValue>>;

/** Records a linked change of `color` (only the channels the group links). */
export function recordLinkChange(values: LinkValues | undefined, group: LinkGroup, change: LinkChange, at: number): LinkValues {
  const prev = values?.[group.color] ?? {};
  const next: LinkValue = { ...prev };
  if (group.symbol && change.symbol !== undefined) {
    next.symbol = change.symbol;
    next.symbolAt = at;
  }
  if (group.interval && change.interval !== undefined) {
    next.interval = change.interval;
    if (change.customInterval) next.customInterval = change.customInterval;
    else delete next.customInterval;
    next.intervalAt = at;
  }
  if (next.symbolAt === prev.symbolAt && next.intervalAt === prev.intervalAt) return values ?? {};
  return { ...(values ?? {}), [group.color]: next };
}

/**
 * Patch for a cell of `group` that mounts with `cur` (its layout saved at `updatedAt`): the
 * group's newer linked values it does not show yet. Applying it twice is a no-op.
 */
export function mountPatch(value: LinkValue | undefined, group: LinkGroup, cur: CellValues, updatedAt: number): LinkChange {
  const patch: LinkChange = {};
  if (!value) return patch;
  if (group.symbol && value.symbol && (value.symbolAt ?? 0) > updatedAt && value.symbol !== cur.symbol) patch.symbol = value.symbol;
  if (
    group.interval &&
    value.interval &&
    (value.intervalAt ?? 0) > updatedAt &&
    (value.interval !== cur.interval || (value.customInterval ?? "") !== (cur.customInterval ?? ""))
  ) {
    patch.interval = value.interval;
    if (value.customInterval || cur.customInterval) patch.customInterval = value.customInterval;
  }
  return patch;
}

const INTERVAL_RE = /^(1m|5m|15m|30m|1h|4h|1D|1W|1M)$/;

/** Stored link values, validated (unknown colors and malformed entries dropped). */
export function normalizeLinkValues(raw: unknown): LinkValues | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: LinkValues = {};
  for (const color of LINK_COLORS) {
    const v = (raw as Record<string, unknown>)[color] as Record<string, unknown> | undefined;
    if (!v || typeof v !== "object") continue;
    const e: LinkValue = {};
    if (typeof v.symbol === "string" && v.symbol && typeof v.symbolAt === "number") {
      e.symbol = v.symbol.slice(0, 200);
      e.symbolAt = v.symbolAt;
    }
    if (typeof v.interval === "string" && INTERVAL_RE.test(v.interval) && typeof v.intervalAt === "number") {
      e.interval = v.interval as Interval;
      e.intervalAt = v.intervalAt;
      if (typeof v.customInterval === "string" && v.customInterval) e.customInterval = v.customInterval.slice(0, 16);
    }
    if (e.symbolAt !== undefined || e.intervalAt !== undefined) out[color] = e;
  }
  return Object.keys(out).length ? out : undefined;
}
