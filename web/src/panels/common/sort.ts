// Table sorting: header clicks cycle desc -> asc -> off; nulls always sort last.

import { useState } from "react";

export interface SortState<K extends string> {
  key: K;
  dir: "asc" | "desc";
}

export function nextSort<K extends string>(cur: SortState<K> | null, key: K): SortState<K> | null {
  if (!cur || cur.key !== key) return { key, dir: "desc" };
  if (cur.dir === "desc") return { key, dir: "asc" };
  return null;
}

export function compareValues(a: unknown, b: unknown): number {
  const na = a === null || a === undefined || (typeof a === "number" && !Number.isFinite(a));
  const nb = b === null || b === undefined || (typeof b === "number" && !Number.isFinite(b));
  if (na || nb) return na === nb ? 0 : na ? 1 : -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

/** Stable sort of `rows` by `get(row, key)`; nulls last in both directions. */
export function sortBy<T, K extends string>(rows: readonly T[], sort: SortState<K> | null, get: (row: T, key: K) => unknown): T[] {
  if (!sort) return [...rows];
  const sign = sort.dir === "asc" ? 1 : -1;
  return rows
    .map((r, i) => ({ r, i }))
    .sort((x, y) => {
      const a = get(x.r, sort.key);
      const b = get(y.r, sort.key);
      const nullish = (v: unknown) => v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v));
      if (nullish(a) || nullish(b)) return compareValues(a, b) || x.i - y.i;
      return sign * compareValues(a, b) || x.i - y.i;
    })
    .map((x) => x.r);
}

export function useSort<K extends string>(initial: SortState<K> | null = null) {
  const [sort, setSort] = useState<SortState<K> | null>(initial);
  return { sort, setSort, toggle: (key: K) => setSort((s) => nextSort(s, key)) };
}

export const sortMark = <K extends string>(sort: SortState<K> | null, key: K) => (sort?.key === key ? (sort.dir === "asc" ? " ▲" : " ▼") : "");
