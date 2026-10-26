// Right-side watchlist: named lists, live quotes, add/remove/reorder, click to load.

import { useState } from "react";
import type { Watchlist } from "@qt/core";
import { useQuotes, useWatchlists } from "../hooks/useWatchlists";
import { uid } from "../state/layoutDefaults";
import { copyText } from "../state/chartMenuFor";
import { watchlistRowMenu } from "../state/menus";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu } from "./ContextMenu";
import type { MenuItem } from "./menuTypes";
import { Icon } from "./icons";
import { SymbolSearch } from "./SymbolSearch";
import { TextPrompt } from "./TextPrompt";
import { WatchlistRow } from "./WatchlistRow";
import "../styles/watchlist.css";

interface Props {
  activeSymbol: string;
  onSelect(symbol: string): void;
}

export function WatchlistPanel({ activeSymbol, onSelect }: Props) {
  const { lists, save, error } = useWatchlists();
  const [listId, setListId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [naming, setNaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const list = lists.find((l) => l.id === listId) ?? lists[0];
  const quotes = useQuotes(list?.symbols ?? []);

  const update = (fn: (l: Watchlist) => Watchlist) => {
    if (!list) return;
    save(lists.map((l) => (l.id === list.id ? fn(l) : l)));
  };

  const newList = (name: string) => {
    const wl: Watchlist = { id: uid("w"), name: name.trim(), symbols: [] };
    save([...lists, wl]);
    setListId(wl.id);
  };

  const removeList = () => {
    if (!list || lists.length <= 1) return;
    save(lists.filter((l) => l.id !== list.id));
    setListId(null);
  };

  const move = (from: number, to: number) =>
    update((l) => {
      const s = [...l.symbols];
      const [x] = s.splice(from, 1);
      s.splice(to, 0, x);
      return { ...l, symbols: s };
    });

  return (
    <aside className="watchlist" aria-label="Watchlist">
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
        <button className="icon-btn" title="New watchlist" onClick={() => setNaming(true)}>
          <Icon name="listPlus" size={16} />
        </button>
        <button className="icon-btn" title="Delete watchlist" onClick={() => setConfirmDelete(true)} disabled={lists.length <= 1}>
          <Icon name="trash" size={16} />
        </button>
      </div>
      <div className="wl-cols">
        <span>Symbol</span>
        <span>Last</span>
        <span>Chg</span>
        <span>Chg%</span>
      </div>
      <ul className="wl-rows">
        {list?.symbols.map((s, i) => (
          <WatchlistRow
            key={s}
            symbol={s}
            quote={quotes.get(s)}
            active={s === activeSymbol}
            onClick={() => onSelect(s)}
            onRemove={() => update((l) => ({ ...l, symbols: l.symbols.filter((x) => x !== s) }))}
            onContextMenu={(x, y) => {
              if (!list) return;
              const others = lists.filter((l) => l.id !== list.id).map((l) => ({ id: l.id, name: l.name, has: l.symbols.includes(s) }));
              setMenu({
                x,
                y,
                items: watchlistRowMenu(i, list.symbols.length, others, {
                  open: () => onSelect(s),
                  copy: () => copyText(s),
                  moveUp: () => move(i, i - 1),
                  moveDown: () => move(i, i + 1),
                  addTo: (id) => save(lists.map((l) => (l.id === id && !l.symbols.includes(s) ? { ...l, symbols: [...l.symbols, s] } : l))),
                  remove: () => update((l) => ({ ...l, symbols: l.symbols.filter((x) => x !== s) })),
                }),
              });
            }}
            onDragStart={() => setDragFrom(i)}
            onDrop={() => {
              if (dragFrom != null && dragFrom !== i) move(dragFrom, i);
              setDragFrom(null);
            }}
          />
        ))}
        {list && list.symbols.length === 0 && <li className="wl-empty">Empty list. Use + to add symbols.</li>}
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
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} label="Watchlist row" />}
      {naming && (
        <TextPrompt
          title="New watchlist"
          label="Watchlist name"
          initial={`List ${lists.length + 1}`}
          required
          maxLength={100}
          onSubmit={newList}
          onClose={() => setNaming(false)}
        />
      )}
      {confirmDelete && list && (
        <ConfirmDialog
          title="Delete watchlist"
          message={`Delete watchlist "${list.name}"? Its symbols are removed with it.`}
          confirmLabel="Delete"
          onConfirm={removeList}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </aside>
  );
}
