// Grid geometry for multi-chart tabs. Pure (no DOM): every grid kind is a set of column and
// row tracks plus cells placed on them. `sizes` stores the column fractions followed by the
// row fractions (each group sums to 1); splitters move the boundary between two tracks.

import type { GridKind } from "@qt/core";

export interface GridCellSpec {
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

export interface GridSpec {
  cols: number;
  rows: number;
  cells: GridCellSpec[];
}

/** Fractions of the grid container (0..1). */
export interface CellRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** A draggable boundary between track `index - 1` and track `index`. */
export interface Splitter {
  axis: "col" | "row";
  index: number;
  /** Position of the boundary along its axis (0..1). */
  pos: number;
  /** Extent across the other axis (0..1). */
  start: number;
  end: number;
}

export const GRID_KINDS: GridKind[] = ["1", "2h", "2v", "3", "4", "6", "8", "9", "12", "16"];

/** Smallest track fraction a splitter drag may leave. */
export const MIN_TRACK = 0.08;

const DIMS: Record<GridKind, [cols: number, rows: number]> = {
  "1": [1, 1],
  "2h": [2, 1],
  "2v": [1, 2],
  "3": [2, 2],
  "4": [2, 2],
  "6": [3, 2],
  "8": [4, 2],
  "9": [3, 3],
  "12": [4, 3],
  "16": [4, 4],
};

export function isGridKind(v: unknown): v is GridKind {
  return typeof v === "string" && (GRID_KINDS as string[]).includes(v);
}

export function gridSpec(kind: GridKind): GridSpec {
  const [cols, rows] = DIMS[kind] ?? DIMS["1"];
  if (kind === "3") {
    // One large chart on the left, two stacked on the right.
    return {
      cols,
      rows,
      cells: [
        { col: 0, row: 0, colSpan: 1, rowSpan: 2 },
        { col: 1, row: 0, colSpan: 1, rowSpan: 1 },
        { col: 1, row: 1, colSpan: 1, rowSpan: 1 },
      ],
    };
  }
  const cells: GridCellSpec[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) cells.push({ col: c, row: r, colSpan: 1, rowSpan: 1 });
  return { cols, rows, cells };
}

export function cellCount(kind: GridKind): number {
  return gridSpec(kind).cells.length;
}

export function defaultSizes(kind: GridKind): number[] {
  const { cols, rows } = gridSpec(kind);
  return [...Array<number>(cols).fill(1 / cols), ...Array<number>(rows).fill(1 / rows)];
}

function normalizeGroup(v: number[]): number[] | null {
  if (v.some((x) => !Number.isFinite(x) || x <= 0)) return null;
  const sum = v.reduce((s, x) => s + x, 0);
  return v.map((x) => x / sum);
}

/** Stored sizes when they fit the grid kind, otherwise the even default. */
export function normalizeSizes(kind: GridKind, sizes?: readonly number[]): number[] {
  const { cols, rows } = gridSpec(kind);
  if (!Array.isArray(sizes) || sizes.length !== cols + rows) return defaultSizes(kind);
  const c = normalizeGroup(sizes.slice(0, cols));
  const r = normalizeGroup(sizes.slice(cols));
  return c && r ? [...c, ...r] : defaultSizes(kind);
}

export function splitSizes(kind: GridKind, sizes?: readonly number[]): { cols: number[]; rows: number[] } {
  const { cols } = gridSpec(kind);
  const s = normalizeSizes(kind, sizes);
  return { cols: s.slice(0, cols), rows: s.slice(cols) };
}

const prefix = (v: number[]) => v.reduce<number[]>((acc, x) => [...acc, acc[acc.length - 1] + x], [0]);

export function cellRects(kind: GridKind, sizes?: readonly number[]): CellRect[] {
  const spec = gridSpec(kind);
  const { cols, rows } = splitSizes(kind, sizes);
  const cx = prefix(cols);
  const ry = prefix(rows);
  return spec.cells.map((c) => ({
    left: cx[c.col],
    top: ry[c.row],
    width: cx[c.col + c.colSpan] - cx[c.col],
    height: ry[c.row + c.rowSpan] - ry[c.row],
  }));
}

/** Boundaries that can be dragged; a boundary is skipped where a spanning cell covers it. */
export function splitters(kind: GridKind, sizes?: readonly number[]): Splitter[] {
  const spec = gridSpec(kind);
  const { cols, rows } = splitSizes(kind, sizes);
  const cx = prefix(cols);
  const ry = prefix(rows);
  const out: Splitter[] = [];
  const crossed = (axis: "col" | "row", k: number, other: number) =>
    spec.cells.some((c) =>
      axis === "col"
        ? c.col < k && c.col + c.colSpan > k && c.row <= other && c.row + c.rowSpan > other
        : c.row < k && c.row + c.rowSpan > k && c.col <= other && c.col + c.colSpan > other,
    );
  for (let k = 1; k < spec.cols; k++) {
    const open = [...Array(spec.rows).keys()].filter((r) => !crossed("col", k, r));
    if (open.length) out.push({ axis: "col", index: k, pos: cx[k], start: ry[open[0]], end: ry[open[open.length - 1] + 1] });
  }
  for (let k = 1; k < spec.rows; k++) {
    const open = [...Array(spec.cols).keys()].filter((c) => !crossed("row", k, c));
    if (open.length) out.push({ axis: "row", index: k, pos: ry[k], start: cx[open[0]], end: cx[open[open.length - 1] + 1] });
  }
  return out;
}

/**
 * Move the boundary between tracks `index - 1` and `index` on `axis` by `delta` (fraction of
 * the container). Both tracks keep at least `min`; the other tracks are unchanged.
 */
export function dragSplitter(kind: GridKind, sizes: readonly number[] | undefined, axis: "col" | "row", index: number, delta: number, min = MIN_TRACK): number[] {
  const { cols, rows } = splitSizes(kind, sizes);
  const v = axis === "col" ? [...cols] : [...rows];
  if (index < 1 || index >= v.length || !Number.isFinite(delta)) return [...cols, ...rows];
  const pair = v[index - 1] + v[index];
  const lo = Math.min(min, pair / 2);
  const a = Math.max(lo, Math.min(pair - lo, v[index - 1] + delta));
  v[index - 1] = a;
  v[index] = pair - a;
  return axis === "col" ? [...v, ...rows] : [...cols, ...v];
}
