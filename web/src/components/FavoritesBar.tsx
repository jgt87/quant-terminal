// Floating favorites bar: the starred drawing tools in one draggable row. Position and contents
// are kept in the drawing prefs (localStorage). Hidden when no tool is starred.

import { useRef } from "react";
import type { Tool } from "../chart/drawings/DrawingController";
import { getTool } from "../chart/drawings/registry";
import { setDrawingPrefs, toggleFavorite, useDrawingPrefs } from "../state/drawingPrefs";
import { Icon } from "./icons";

interface Props {
  tool: Tool;
  /** `from`: the clicked button (a tool chooser opens next to it). */
  onTool(tool: Tool, from?: HTMLElement): void;
}

export function FavoritesBar({ tool, onTool }: Props) {
  const prefs = useDrawingPrefs();
  const ref = useRef<HTMLDivElement>(null);
  const tools = prefs.favorites.map((t) => getTool(t)).filter((t): t is NonNullable<typeof t> => Boolean(t));
  if (!tools.length || !prefs.favoritesBar.visible) return null;
  const { x, y } = prefs.favoritesBar;
  const left = Math.max(0, Math.min(window.innerWidth - 60, x));
  const top = Math.max(0, Math.min(window.innerHeight - 40, y));

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const dx = e.clientX - left;
    const dy = e.clientY - top;
    const move = (ev: PointerEvent) => setDrawingPrefs((p) => ({ favoritesBar: { ...p.favoritesBar, x: ev.clientX - dx, y: ev.clientY - dy } }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div ref={ref} className="favorites-bar" role="toolbar" aria-label="Favorite drawing tools" style={{ left, top }}>
      <span className="fav-grip" title="Drag to move" onPointerDown={startDrag}>
        <Icon name="grip" size={14} />
      </span>
      {tools.map((t) => (
        <button
          key={t.type}
          className={`tool-btn${tool === t.type ? " active" : ""}`}
          title={t.hotkey ? `${t.label} (${t.hotkey})` : t.label}
          aria-pressed={tool === t.type}
          data-fav={t.type}
          onClick={(e) => onTool(t.type, e.currentTarget)}
          onContextMenu={(e) => {
            e.preventDefault();
            toggleFavorite(t.type);
          }}
        >
          <Icon name={t.icon} path={t.iconPath} />
        </button>
      ))}
    </div>
  );
}
