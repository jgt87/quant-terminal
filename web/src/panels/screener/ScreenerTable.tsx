// Sortable screener result table. Click (or Enter on a focused row) loads the symbol; arrow
// keys move between rows.

import type { ScreenerField, ScreenerRow } from "@qt/core";
import { sortBy, sortMark, useSort } from "../common/sort";
import { fieldMeta, fieldTone, formatField } from "./screenerModel";

interface Props {
  rows: ScreenerRow[];
  columns: ScreenerField[];
  activeSymbol: string;
  onOpen(symbol: string): void;
}

type Key = "symbol" | ScreenerField;

export function ScreenerTable({ rows, columns, activeSymbol, onOpen }: Props) {
  const { sort, toggle } = useSort<Key>();
  const sorted = sortBy(rows, sort, (r, k) => (k === "symbol" ? r.symbol : (r.values[k] ?? null)));
  const move = (el: HTMLElement, dir: 1 | -1) => {
    const next = (dir > 0 ? el.nextElementSibling : el.previousElementSibling) as HTMLElement | null;
    next?.focus();
  };
  return (
    <div className="pn-table-wrap">
      <table className="pn-table sc-table">
        <thead>
          <tr>
            <th className="left" onClick={() => toggle("symbol")} aria-sort={sort?.key === "symbol" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
              Symbol{sortMark(sort, "symbol")}
            </th>
            {columns.map((c) => (
              <th key={c} onClick={() => toggle(c)} title={fieldMeta(c).label} aria-sort={sort?.key === c ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                {fieldMeta(c).short}
                {sortMark(sort, c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={r.symbol}
              tabIndex={0}
              className={r.symbol === activeSymbol ? "active" : ""}
              data-symbol={r.symbol}
              onClick={() => onOpen(r.symbol)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onOpen(r.symbol);
                else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(e.currentTarget, e.key === "ArrowDown" ? 1 : -1);
                }
              }}
              title={r.name}
            >
              <td className="left sym">{r.symbol}</td>
              {columns.map((c) => (
                <td key={c} className={`num ${fieldTone(c, r.values[c])}`}>
                  {formatField(c, r.values[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
