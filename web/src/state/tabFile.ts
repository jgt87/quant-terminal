// Export and import of one chart tab as a JSON file: its name, grid, split sizes and link colors,
// with the full layout of every chart (symbol, interval, indicators, drawings, settings). Pure:
// the caller loads the layouts, picks the file and assigns the new ids.

import type { Layout, LinkColor } from "@qt/core";
import { cellCount, isGridKind, normalizeSizes } from "./grid";
import { isLinkColor } from "./links";
import type { TabState } from "./workspace";

export const TAB_FILE_KIND = "chart-tab";
export const TAB_FILE_VERSION = 1;
/** Files larger than this are refused before parsing. */
export const MAX_TAB_FILE_BYTES = 20 * 1024 * 1024;

export interface TabFile {
  kind: typeof TAB_FILE_KIND;
  version: number;
  exportedAt: string;
  tab: {
    name: string;
    grid: TabState["grid"];
    sizes?: number[];
    cells: { link?: LinkColor; layout: Layout }[];
  };
}

/** A tab ready to add: layouts carry their new ids, the tab's cells point at them. */
export interface ImportedTab {
  tab: TabState;
  layouts: Layout[];
}

/** The file for `tab`; `layouts[i]` is the layout of cell i (cells without one are left out). */
export function tabToFile(tab: TabState, layouts: readonly (Layout | null)[], now = Date.now()): TabFile {
  const n = cellCount(tab.grid);
  const cells: TabFile["tab"]["cells"] = [];
  for (let i = 0; i < n; i++) {
    const layout = layouts[i];
    if (!layout) continue;
    const link = tab.cells[i]?.link;
    cells.push({ ...(link ? { link } : {}), layout });
  }
  return {
    kind: TAB_FILE_KIND,
    version: TAB_FILE_VERSION,
    exportedAt: new Date(now).toISOString(),
    tab: { name: tab.name, grid: tab.grid, ...(tab.sizes ? { sizes: tab.sizes } : {}), cells },
  };
}

/** File name for an exported tab, e.g. "Swing-2026-11-07.tab.json". */
export function tabFileName(name: string, now = Date.now()): string {
  const safe = name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "chart-tab";
  return `${safe}-${new Date(now).toISOString().slice(0, 10)}.tab.json`;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Reads a tab file. Every layout gets a new id from `newId` (so an import never overwrites a chart)
 * and the tab gets `tabId`. Throws an Error with a readable message for anything unusable. The
 * layouts themselves are checked again by the server when they are saved.
 */
export function parseTabFile(text: string, tabId: string, newId: () => string, now = Date.now()): ImportedTab {
  if (text.length > MAX_TAB_FILE_BYTES) throw new Error("The file is too large for a chart tab");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON");
  }
  if (!isObj(raw) || raw.kind !== TAB_FILE_KIND || !isObj(raw.tab)) throw new Error("This is not an exported chart tab");
  if (typeof raw.version !== "number" || raw.version > TAB_FILE_VERSION) throw new Error("The tab was exported by a newer version; update the app first");
  const t = raw.tab;
  if (!isGridKind(t.grid)) throw new Error("The tab has an unknown grid");
  const grid = t.grid;
  const cells = Array.isArray(t.cells) ? t.cells : [];
  const n = cellCount(grid);
  if (cells.length !== n) throw new Error(`The ${grid} grid needs ${n} chart${n === 1 ? "" : "s"}, the file has ${cells.length}`);
  const layouts: Layout[] = [];
  const tabCells: TabState["cells"] = [];
  cells.forEach((c, i) => {
    if (!isObj(c) || !isObj(c.layout) || typeof c.layout.symbol !== "string" || typeof c.layout.interval !== "string") {
      throw new Error(`Chart ${i + 1} in the file is not a chart layout`);
    }
    const id = newId();
    layouts.push({ ...(c.layout as unknown as Layout), id, updatedAt: now });
    tabCells.push(isLinkColor(c.link) ? { layoutId: id, link: c.link } : { layoutId: id });
  });
  const name = typeof t.name === "string" && t.name.trim() ? t.name.trim().slice(0, 60) : "Imported";
  return { tab: { id: tabId, name, grid, cells: tabCells, sizes: normalizeSizes(grid, Array.isArray(t.sizes) ? (t.sizes as number[]) : undefined), activeCell: 0 }, layouts };
}
