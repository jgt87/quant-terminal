// Floating toolbar over the selected drawing. The buttons come from the tool's catalog layout
// (DrawingToolDef.floatingToolbar, rendered in the master order of chart/drawings/floatbar.ts):
// drag handle · templates · line / background / text color · font size · width · style ·
// settings · add alert · lock · anchor · remove · more. Dragging the handle pins the bar for the
// session (double-click the handle to follow the drawing again).

import { useRef, useState } from "react";
import type { Drawing, LineStyle } from "@qt/core";
import { floatBinding, floatButtons, FLOAT_TITLES, widthChoices } from "../chart/drawings/floatbar";
import { getTool } from "../chart/drawings/registry";
import { FONT_SIZES } from "../chart/drawings/schema";
import type { FloatButton, ToolGeom } from "../chart/drawings/types";
import type { ChartTheme } from "../chart/theme";
import { ColorPicker } from "./ColorPicker";
import { ContextMenu } from "./ContextMenu";
import { Icon } from "./icons";
import type { MenuItem } from "./menuTypes";
import "../styles/floatbar.css";

interface Props {
  drawing: Drawing;
  x: number;
  y: number;
  theme: ChartTheme;
  /** "Lock all drawings" is on: the lock button shows locked and edits are blocked. */
  lockedAll?: boolean;
  onChange(fn: (d: Drawing) => Drawing, mergeKey?: string): void;
  onSettings(): void;
  onRemove(): void;
  onAlert?(): void;
  /** Template ▸ / More ▸: the caller opens the menu at client (x, y). */
  onMenu(kind: "template" | "more", x: number, y: number): void;
  /** Chart projection for bindings that need it (anchoring). */
  geom?: ToolGeom;
}

const STYLES: { id: LineStyle; icon: string; label: string }[] = [
  { id: "solid", icon: "lineSolid", label: "Solid" },
  { id: "dashed", icon: "lineDashed", label: "Dashed" },
  { id: "dotted", icon: "lineDotted", label: "Dotted" },
];

// ---------- session position (pinned by dragging the handle) ----------

const PIN_KEY = "qt.floatbar.pos";
const pinListeners = new Set<() => void>();

/** Position the user dragged the bar to (chart-view px), null when it follows the drawing. */
export function floatBarPinned(): { x: number; y: number } | null {
  try {
    const raw = sessionStorage.getItem(PIN_KEY);
    return raw ? (JSON.parse(raw) as { x: number; y: number }) : null;
  } catch {
    return null;
  }
}

function setPinned(p: { x: number; y: number } | null): void {
  try {
    if (p) sessionStorage.setItem(PIN_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(PIN_KEY);
  } catch {
    /* storage unavailable */
  }
  for (const fn of pinListeners) fn();
}

export function onFloatBarPin(fn: () => void): () => void {
  pinListeners.add(fn);
  return () => pinListeners.delete(fn);
}

export function DrawingFloatBar({ drawing: d, x, y, theme, lockedAll, onChange, onSettings, onRemove, onAlert, onMenu, geom }: Props) {
  const def = getTool(d.type);
  const [menu, setMenu] = useState<{ kind: "width" | "style" | "font-size"; x: number; y: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);
  if (!def) return null;
  const buttons = floatButtons(def);
  const get = (b: FloatButton) => floatBinding(def, b, theme)?.get(d, theme);
  const put = (b: FloatButton, v: unknown, merge?: string) => {
    const bind = floatBinding(def, b, theme);
    if (bind) onChange((k) => bind.set(k, v, geom), merge);
  };
  const widthBtn: FloatButton = buttons.includes("highlighter-width") ? "highlighter-width" : "line-tool-width";
  const width = Number(get(widthBtn) ?? 1);
  const lineStyle = (get("style") as LineStyle | undefined) ?? "solid";
  const locked = lockedAll || Boolean(d.locked);
  const at = (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: r.left, y: r.bottom + 4 };
  };

  const startDrag = (e: React.PointerEvent) => {
    const el = root.current;
    const parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return;
    e.preventDefault();
    const pr = parent.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const dx = e.clientX - r.left;
    const dy = e.clientY - r.top;
    const move = (ev: PointerEvent) => setPinned({ x: Math.round(ev.clientX - pr.left - dx), y: Math.round(ev.clientY - pr.top - dy) });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const menuItems = (): MenuItem[] => {
    if (!menu) return [];
    if (menu.kind === "width") return widthChoices(def, widthBtn).map((w) => ({ label: w.label, checked: w.value === width, onSelect: () => put(widthBtn, w.value) }));
    if (menu.kind === "style") return STYLES.map((s) => ({ label: s.label, icon: s.icon, checked: s.id === lineStyle, onSelect: () => put("style", s.id) }));
    const cur = Number(get("font-size") ?? 12);
    return FONT_SIZES.map((n) => ({ label: String(n), checked: n === cur, onSelect: () => put("font-size", n) }));
  };

  const color = (b: FloatButton, label: string, icon: string, line = false) => (
    <ColorPicker
      key={b}
      label={label}
      icon={icon}
      title={FLOAT_TITLES[b]}
      value={String(get(b) ?? theme.drawing)}
      onChange={(v) => put(b, v, `fb-${b}:${d.id}`)}
      line={
        line && buttons.includes(widthBtn)
          ? {
              width,
              style: lineStyle,
              onWidth: (w) => put(widthBtn, w),
              onStyle: (s) => {
                if (buttons.includes("style")) put("style", s);
              },
            }
          : undefined
      }
    />
  );

  const render = (b: FloatButton) => {
    switch (b) {
      case "templates":
        return (
          <button key={b} className="icon-btn" title={FLOAT_TITLES[b]} aria-label="Template" aria-haspopup="menu" onClick={(e) => onMenu("template", at(e).x, at(e).y)}>
            <Icon name="template" size={18} />
          </button>
        );
      case "insert-column":
      case "insert-row":
        return (
          <button key={b} className="icon-btn" title={FLOAT_TITLES[b]} aria-label={FLOAT_TITLES[b]} onClick={() => put(b, true)}>
            <Icon name="plus" size={18} />
          </button>
        );
      case "line-tool-color":
        return color(b, "Drawing", "pencil", true);
      case "background-color":
        return color(b, "Background", "bucket");
      case "background-color-2":
        return color(b, "Second background", "bucket");
      case "text-color":
        return color(b, "Text", "textColor");
      case "font-size":
        return (
          <button key={b} className="tb-btn fb-width" aria-label="Font size" aria-haspopup="menu" title={FLOAT_TITLES[b]} onClick={(e) => setMenu({ kind: "font-size", ...at(e) })}>
            {String(get(b) ?? 12)}
          </button>
        );
      case "line-tool-width":
      case "highlighter-width":
        return (
          <button key={b} className="tb-btn fb-width" aria-label="Line width" aria-haspopup="menu" title={FLOAT_TITLES[b]} onClick={(e) => setMenu({ kind: "width", ...at(e) })}>
            <span className="fb-width-sample" style={{ height: Math.min(4, width) }} />
            {width}px
          </button>
        );
      case "style":
        return (
          <button key={b} className="icon-btn" aria-label="Line style" aria-haspopup="menu" title={FLOAT_TITLES[b]} onClick={(e) => setMenu({ kind: "style", ...at(e) })}>
            <Icon name={STYLES.find((s) => s.id === lineStyle)?.icon ?? "lineSolid"} size={18} />
          </button>
        );
      case "settings":
        return (
          <button key={b} className="icon-btn" title={FLOAT_TITLES[b]} aria-label="Drawing settings" onClick={onSettings}>
            <Icon name="settings" size={18} />
          </button>
        );
      case "add-alert":
        return onAlert ? (
          <button key={b} className="icon-btn" title={FLOAT_TITLES[b]} aria-label="Add alert on this drawing" onClick={onAlert}>
            <Icon name="alertBell" size={18} />
          </button>
        ) : null;
      case "lock":
        return (
          <button
            key={b}
            className={`icon-btn${locked ? " on" : ""}`}
            title={d.locked ? "Unlock" : FLOAT_TITLES[b]}
            aria-label={d.locked ? "Unlock drawing" : "Lock drawing"}
            aria-pressed={locked}
            disabled={lockedAll}
            onClick={() => onChange((k) => ({ ...k, locked: !k.locked || undefined }))}
          >
            <Icon name={locked ? "lock" : "unlock"} size={18} />
          </button>
        );
      case "toggle-anchor": {
        const on = Boolean(get(b));
        return (
          <button key={b} className={`icon-btn${on ? " on" : ""}`} title={FLOAT_TITLES[b]} aria-label="Anchor drawing" aria-pressed={on} onClick={() => put(b, !on || undefined)}>
            <Icon name="anchor" size={18} />
          </button>
        );
      }
      case "remove":
        return (
          <button key={b} className="icon-btn" title={FLOAT_TITLES[b]} aria-label="Remove drawing" onClick={onRemove}>
            <Icon name="trash" size={18} />
          </button>
        );
      case "more":
        return (
          <button key={b} className="icon-btn" title={FLOAT_TITLES[b]} aria-label="More" aria-haspopup="menu" onClick={(e) => onMenu("more", at(e).x, at(e).y)}>
            <Icon name="more" size={18} />
          </button>
        );
    }
  };

  return (
    <div
      ref={root}
      className="float-bar"
      role="toolbar"
      aria-label="Drawing toolbar"
      data-drawing-type={d.type}
      data-buttons={buttons.join(",")}
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span className="fb-grip" title="Drag to move the toolbar (double-click: follow the drawing)" aria-label="Move toolbar" onPointerDown={startDrag} onDoubleClick={() => setPinned(null)}>
        <Icon name="grip" size={18} />
      </span>
      {buttons.map(render)}
      {menu && <ContextMenu x={menu.x} y={menu.y} label={menu.kind === "width" ? "Line width" : menu.kind === "style" ? "Line style" : "Font size"} onClose={() => setMenu(null)} items={menuItems()} />}
    </div>
  );
}
