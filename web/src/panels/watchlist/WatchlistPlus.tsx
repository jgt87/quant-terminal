// Watchlist with extras: import/export (.txt / .csv), custom columns (quotes + screener fields),
// column sorting, flag colors per symbol with a flag filter. Same props as WatchlistPanel and
// the same stored watchlists (flags are an optional field of each list).

import { useState } from "react";
import type { FlagColor, ScreenerField, Watchlist } from "@qt/core";
import { formatPct, formatPrice, formatSigned, priceDecimals } from "../../chart/format";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { ContextMenu } from "../../components/ContextMenu";
import { Icon } from "../../components/icons";
import type { MenuItem } from "../../components/menuTypes";
import { SEP } from "../../components/menuTypes";
import { SymbolSearch } from "../../components/SymbolSearch";
import { TextPrompt } from "../../components/TextPrompt";
import { useQuotes, useWatchlists } from "../../hooks/useWatchlists";
import { useScreenerValues } from "../../hooks/watchlistExtras";
import { copyText } from "../../state/chartMenuFor";
import { uid } from "../../state/layoutDefaults";
import { ColumnChooser } from "../common/ColumnChooser";
import { dateStamp, downloadText, pickTextFile } from "../common/files";
import { sortBy, sortMark, useSort } from "../common/sort";
import { loadLocal, saveLocal } from "../common/storage";
import { pushToast } from "../common/toasts";
import { panelIcon } from "../panelIcons";
import { fieldTone, formatField } from "../screener/screenerModel";
import {
  columnDef, DEFAULT_WATCH_COLUMNS, FLAG_COLORS, mergeIntoList, parseSymbolFile, quoteValue, screenerColumns, setFlag, watchlistToCsv, watchlistToTxt,
  WATCH_COLUMNS, type QuoteColumn, type WatchColumn,
} from "./watchlistModel";
import "../../styles/watchlist.css";
import "./watchlist.css";

interface Props {
  activeSymbol: string;
  onSelect(symbol: string): void;
}

const COLS_KEY = "qt.watchlist.columns";
type SortKey = "symbol" | "flag" | WatchColumn;

export function WatchlistPlus({ activeSymbol, onSelect }: Props) {
  const { lists, save, error } = useWatchlists();
  const [listId, setListId] = useState<string | null>(null);
  const [columns, setColumnsState] = useState<WatchColumn[]>(() => loadLocal(COLS_KEY, DEFAULT_WATCH_COLUMNS));
  const [flagFilter, setFlagFilter] = useState<FlagColor | "">("");
  const [adding, setAdding] = useState(false);
  const [naming, setNaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const { sort, toggle } = useSort<SortKey>();
  const list = lists.find((l) => l.id === listId) ?? lists[0];
  const symbols = list?.symbols ?? [];
  const quotes = useQuotes(symbols);
  const scrCols = screenerColumns(columns);
  const scr = useScreenerValues(symbols, scrCols);

  const setColumns = (c: WatchColumn[]) => {
    setColumnsState(c);
    saveLocal(COLS_KEY, c);
  };
  const update = (fn: (l: Watchlist) => Watchlist) => list && save(lists.map((l) => (l.id === list.id ? fn(l) : l)));
  const value = (s: string, c: WatchColumn): number | null =>
    columnDef(c).source === "quote" ? quoteValue(quotes.get(s), c as QuoteColumn) : (scr.get(s)?.[c as ScreenerField] ?? null);

  const flagOrder = (s: string) => {
    const f = list?.flags?.[s];
    return f ? FLAG_COLORS.indexOf(f) : null;
  };
  const visible = symbols.filter((s) => !flagFilter || list?.flags?.[s] === flagFilter);
  const rows = sortBy(visible, sort, (s, k) => (k === "symbol" ? s : k === "flag" ? flagOrder(s) : value(s, k)));

  const importFile = async () => {
    const f = await pickTextFile(".txt,.csv,text/plain,text/csv");
    if (!f || !list) return;
    const { symbols: syms, flags, skipped } = parseSymbolFile(f.text, f.name);
    if (syms.length === 0) return pushToast({ title: "Nothing imported", body: "No symbols found in the file.", tone: "error" });
    const before = list.symbols.length;
    const next = mergeIntoList(list, syms, flags);
    update(() => next);
    pushToast({ title: `Imported ${next.symbols.length - before} new symbol${next.symbols.length - before === 1 ? "" : "s"} into ${list.name}`, body: skipped.length ? `Skipped: ${skipped.slice(0, 5).join(", ")}` : undefined });
  };

  const exportMenu = (x: number, y: number) =>
    list &&
    setMenu({
      x,
      y,
      items: [
        { label: "Export symbols (.txt)", onSelect: () => downloadText(`${list.name}-${dateStamp()}.txt`, watchlistToTxt(list)) },
        { label: "Export with columns (.csv)", onSelect: () => downloadText(`${list.name}-${dateStamp()}.csv`, watchlistToCsv(list, columns, value), "text/csv;charset=utf-8") },
        SEP,
        { label: "Import symbols (.txt / .csv)…", onSelect: () => void importFile() },
      ],
    });

  const rowMenu = (s: string, x: number, y: number) => {
    if (!list) return;
    const i = list.symbols.indexOf(s);
    const others = lists.filter((l) => l.id !== list.id);
    const move = (to: number) =>
      update((l) => {
        const arr = [...l.symbols];
        const [v] = arr.splice(i, 1);
        arr.splice(to, 0, v);
        return { ...l, symbols: arr };
      });
    setMenu({
      x,
      y,
      items: [
        { label: "Open chart", onSelect: () => onSelect(s) },
        { label: "Copy symbol", onSelect: () => copyText(s) },
        SEP,
        {
          label: "Flag",
          submenu: [
            ...FLAG_COLORS.map((c) => ({ label: c[0].toUpperCase() + c.slice(1), checked: list.flags?.[s] === c, onSelect: () => update((l) => setFlag(l, s, c)) })),
            SEP,
            { label: "Remove flag", disabled: !list.flags?.[s], onSelect: () => update((l) => setFlag(l, s, null)) },
          ],
        },
        { label: "Move up", disabled: i <= 0 || !!sort, onSelect: () => move(i - 1) },
        { label: "Move down", disabled: i >= list.symbols.length - 1 || !!sort, onSelect: () => move(i + 1) },
        {
          label: "Add to list",
          disabled: others.length === 0,
          submenu: others.map((l) => ({
            label: l.name,
            checked: l.symbols.includes(s),
            disabled: l.symbols.includes(s),
            onSelect: () => save(lists.map((o) => (o.id === l.id ? { ...o, symbols: [...o.symbols, s] } : o))),
          })),
        },
        SEP,
        { label: "Remove", shortcut: "Del", onSelect: () => update((l) => setFlag({ ...l, symbols: l.symbols.filter((x) => x !== s) }, s, null)) },
      ],
    });
  };

  /** Click on the flag dot cycles through the colors (then none). */
  const cycleFlag = (s: string) => {
    const cur = list?.flags?.[s];
    const i = cur ? FLAG_COLORS.indexOf(cur) : -1;
    update((l) => setFlag(l, s, i + 1 < FLAG_COLORS.length ? FLAG_COLORS[i + 1] : null));
  };

  const grid = { gridTemplateColumns: `14px minmax(64px, 1.3fr) ${columns.map(() => "minmax(0, 1fr)").join(" ")}` };
  return (
    <aside className="watchlist wlx" aria-label="Watchlist">
      <div className="wl-head">
        <select value={list?.id ?? ""} onChange={(e) => setListId(e.target.value)} aria-label="Watchlist">
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <button className="icon-btn" title="Add symbol" onClick={() => setAdding(true)} disabled={!list}>
          <Icon name="plus" size={16} />
        </button>
        <button className="icon-btn" title="Import / export" onClick={(e) => exportMenu(e.clientX, e.clientY)} disabled={!list}>
          {panelIcon("download", 16)}
        </button>
        <ColumnChooser options={WATCH_COLUMNS.map((c) => ({ id: c.id, label: c.label }))} value={columns} onChange={setColumns} title="Columns" />
        <button className="icon-btn" title="New watchlist" onClick={() => setNaming(true)}>
          <Icon name="listPlus" size={16} />
        </button>
        <button className="icon-btn" title="Delete watchlist" onClick={() => setConfirmDelete(true)} disabled={lists.length <= 1}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <div className="wlx-flags" role="radiogroup" aria-label="Filter by flag">
        <button role="radio" aria-checked={!flagFilter} className={`wlx-flagbtn all${!flagFilter ? " on" : ""}`} onClick={() => setFlagFilter("")} title="All symbols">
          All
        </button>
        {FLAG_COLORS.map((c) => (
          <button key={c} role="radio" aria-checked={flagFilter === c} className={`wlx-flagbtn${flagFilter === c ? " on" : ""}`} title={`Only ${c} flags`} onClick={() => setFlagFilter(flagFilter === c ? "" : c)}>
            <span className={`wlx-dot flag-${c}`} />
          </button>
        ))}
      </div>
      <div className="wlx-cols" style={grid}>
        <span onClick={() => toggle("flag")} title="Sort by flag">
          {sortMark(sort, "flag") || "•"}
        </span>
        <span onClick={() => toggle("symbol")}>Symbol{sortMark(sort, "symbol")}</span>
        {columns.map((c) => (
          <span key={c} className="r" onClick={() => toggle(c)} title={columnDef(c).label}>
            {columnDef(c).short}
            {sortMark(sort, c)}
          </span>
        ))}
      </div>
      <ul className="wl-rows">
        {rows.map((s) => {
          const q = quotes.get(s);
          const dir = !q || q.change === 0 ? "flat" : q.change > 0 ? "pos" : "neg";
          const d = q ? priceDecimals(q.last, s.endsWith("=X")) : 2;
          const flag = list?.flags?.[s];
          return (
            <li
              key={s}
              className={`wlx-row ${dir}${s === activeSymbol ? " active" : ""}`}
              style={grid}
              data-symbol={s}
              tabIndex={0}
              onClick={() => onSelect(s)}
              onContextMenu={(e) => {
                e.preventDefault();
                rowMenu(s, e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSelect(s);
                else if (e.key === "Delete") update((l) => setFlag({ ...l, symbols: l.symbols.filter((x) => x !== s) }, s, null));
                else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  ((e.key === "ArrowDown" ? e.currentTarget.nextElementSibling : e.currentTarget.previousElementSibling) as HTMLElement | null)?.focus();
                } else if (/^[0-7]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
                  // preventDefault keeps the app's type-to-search from taking the digit.
                  e.preventDefault();
                  update((l) => setFlag(l, s, e.key === "0" ? null : FLAG_COLORS[Number(e.key) - 1]));
                }
              }}
              title={s}
            >
              <button
                className={`wlx-flag${flag ? ` flag-${flag}` : ""}`}
                title={flag ? `Flag: ${flag} (click to change, keys 1-7 / 0)` : "Flag (click, or keys 1-7)"}
                aria-label={flag ? `Flag ${flag}` : "No flag"}
                onClick={(e) => {
                  e.stopPropagation();
                  cycleFlag(s);
                }}
              />
              <span className="wl-sym">{s}</span>
              {columns.map((c) => {
                const v = value(s, c);
                const text =
                  c === "last" ? (q ? formatPrice(q.last, d) : "—")
                  : c === "chg" ? (q ? formatSigned(q.change, d) : "")
                  : c === "chgPct" ? (q ? formatPct(q.changePct) : "")
                  : formatField(c, v);
                const tone = c === "chg" || c === "chgPct" ? "wl-chg" : columnDef(c).source === "screener" ? fieldTone(c as ScreenerField, v) : "";
                return (
                  <span key={c} className={`wl-num ${tone}`}>
                    {text}
                  </span>
                );
              })}
            </li>
          );
        })}
        {list && list.symbols.length === 0 && <li className="wl-empty">Empty list. Use + to add symbols, or import a .txt / .csv.</li>}
        {list && list.symbols.length > 0 && rows.length === 0 && <li className="wl-empty">No symbols with this flag.</li>}
      </ul>
      {error && <div className="wl-error">{error}</div>}
      {adding && (
        <SymbolSearch
          initial=""
          title={`Add to ${list?.name ?? "watchlist"}`}
          onPick={(sym) => update((l) => (l.symbols.includes(sym) ? l : { ...l, symbols: [...l.symbols, sym] }))}
          onClose={() => setAdding(false)}
        />
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} label="Watchlist menu" />}
      {naming && (
        <TextPrompt
          title="New watchlist"
          label="Watchlist name"
          initial={`List ${lists.length + 1}`}
          required
          maxLength={100}
          onSubmit={(name) => {
            const wl: Watchlist = { id: uid("w"), name: name.trim(), symbols: [] };
            save([...lists, wl]);
            setListId(wl.id);
          }}
          onClose={() => setNaming(false)}
        />
      )}
      {confirmDelete && list && (
        <ConfirmDialog
          title="Delete watchlist"
          message={`Delete watchlist "${list.name}"? Its symbols are removed with it.`}
          confirmLabel="Delete"
          onConfirm={() => {
            save(lists.filter((l) => l.id !== list.id));
            setListId(null);
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </aside>
  );
}
