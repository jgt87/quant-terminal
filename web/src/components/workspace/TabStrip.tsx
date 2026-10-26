// In-app chart tabs under the toolbar: select, close (button or middle click), rename by
// double-click, drag to reorder, right-click menu (duplicate, rename, close, reopen), "+".

import { useState } from "react";
import { cellCount } from "../../state/grid";
import type { TabState } from "../../state/workspace";
import { ContextMenu } from "../ContextMenu";
import { Icon } from "../icons";
import { SEP, type MenuItem } from "../menuTypes";
import { GridIcon } from "./GridIcon";

interface Props {
  tabs: TabState[];
  activeId: string;
  canReopen: boolean;
  onSelect(id: string): void;
  onNew(): void;
  onClose(id: string): void;
  onRename(id: string, name: string): void;
  onDuplicate(id: string): void;
  onMove(from: number, to: number): void;
  onReopen(): void;
  onShortcuts(): void;
}

export function TabStrip(p: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const tabMenu = (t: TabState): MenuItem[] => [
    { label: "Duplicate tab", shortcut: "Alt+Shift+D", onSelect: () => p.onDuplicate(t.id) },
    { label: "Rename…", onSelect: () => setEditing(t.id) },
    SEP,
    { label: "Reopen closed tab", shortcut: "Alt+Shift+T", disabled: !p.canReopen, onSelect: p.onReopen },
    { label: "Close tab", shortcut: "Alt+W", onSelect: () => p.onClose(t.id) },
  ];

  return (
    <div className="tab-strip">
      <div className="ws-tabs" role="tablist" aria-label="Chart tabs">
        {p.tabs.map((t, i) => {
          const active = t.id === p.activeId;
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              data-tab-id={t.id}
              className={`ws-tab${active ? " active" : ""}${dropAt === i && dragFrom !== null && dragFrom !== i ? " drop" : ""}`}
              draggable={editing !== t.id}
              title={`${t.name}${cellCount(t.grid) > 1 ? ` (${cellCount(t.grid)} charts)` : ""}`}
              onClick={() => p.onSelect(t.id)}
              onDoubleClick={() => setEditing(t.id)}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault(); // no autoscroll on middle click
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  p.onClose(t.id);
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY, items: tabMenu(t) });
              }}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", t.id);
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                setDropAt(i);
              }}
              onDragLeave={() => setDropAt((d) => (d === i ? null : d))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null && dragFrom !== i) p.onMove(dragFrom, i);
                setDragFrom(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
            >
              {cellCount(t.grid) > 1 && <GridIcon kind={t.grid} size={14} />}
              {editing === t.id ? (
                <input
                  className="ws-tab-input"
                  autoFocus
                  defaultValue={t.name}
                  maxLength={60}
                  aria-label="Tab name"
                  onFocus={(e) => e.currentTarget.select()}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      p.onRename(t.id, e.currentTarget.value);
                      setEditing(null);
                    } else if (e.key === "Escape") setEditing(null);
                  }}
                  onBlur={(e) => {
                    p.onRename(t.id, e.currentTarget.value);
                    setEditing(null);
                  }}
                />
              ) : (
                <span className="ws-tab-name">{t.name}</span>
              )}
              <button
                className="ws-tab-close"
                title="Close tab (Alt+W, middle click)"
                aria-label={`Close ${t.name}`}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClose(t.id);
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          );
        })}
      </div>
      <button className="ws-tab-new" title="New tab (Alt+N)" aria-label="New tab" onClick={p.onNew}>
        <Icon name="plus" size={14} />
      </button>
      <span className="spacer" />
      <button className="ws-tab-new" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={p.onShortcuts}>
        <Icon name="keyboard" size={15} />
      </button>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} label="Tab" />}
    </div>
  );
}
