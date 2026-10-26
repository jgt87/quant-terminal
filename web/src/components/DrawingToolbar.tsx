// Left drawing toolbar (reference structure: docs/reference/drawing-menus.json → leftToolbar):
// the cursor group (Cross, Dot, Arrow, Demonstration · Eraser, values tooltip switch), one button
// per tool group with a sectioned flyout (registered tools only; last used tool as the face;
// stars for the favorites bar), then measure, zoom in · magnet ▸, keep drawing, lock all,
// hide ▸ · remove ▸, object tree and the favorites-bar toggle. 52×38 buttons with 28px icons.

import { useEffect, useRef, useState } from "react";
import type { Drawing, MagnetMode } from "@qt/core";
import type { CursorStyle, Tool } from "../chart/drawings/DrawingController";
import { getTool, toolbarGroups } from "../chart/drawings/registry";
import type { DrawingToolDef } from "../chart/drawings/types";
import { setDrawingPrefs, toggleFavorite, useDrawingPrefs } from "../state/drawingPrefs";
import { ContextMenu } from "./ContextMenu";
import { FavoritesBar } from "./FavoritesBar";
import { Icon } from "./icons";
import type { MenuItem } from "./menuTypes";
import { SEP } from "./menuTypes";
import "../styles/drawtools.css";

interface Props {
  tool: Tool;
  drawingCount: number;
  indicatorCount: number;
  /** Whether every indicator of the active chart is hidden. */
  indicatorsHidden: boolean;
  /** `preset`: patch from a tool picker merged into the next drawing. */
  onTool(tool: Tool, preset?: Partial<Drawing>): void;
  onRemoveDrawings(): void;
  onRemoveIndicators(): void;
  onIndicatorsHidden(hidden: boolean): void;
  onObjectTree(): void;
}

type CursorId = CursorStyle | "eraser";

const CURSORS: { id: CursorId; label: string; icon: string }[] = [
  { id: "cross", label: "Cross", icon: "cross" },
  { id: "dot", label: "Dot", icon: "dot" },
  { id: "arrow", label: "Arrow", icon: "arrowCursor" },
  { id: "demo", label: "Demonstration", icon: "demonstration" },
  { id: "eraser", label: "Eraser", icon: "eraser" },
];

/** Icon of a tool (shared icon name or its own 28×28 path). */
export function ToolIcon({ def, size = 28 }: { def: Pick<DrawingToolDef, "icon" | "iconPath" | "iconFill">; size?: number }) {
  return <Icon name={def.icon} path={def.iconPath} fill={def.iconFill} size={size} />;
}

const titleOf = (def: DrawingToolDef) => (def.hotkey ? `${def.label} (${def.hotkey})` : def.label);

type Flyout = { id: string; top: number; left: number } | null;

export function DrawingToolbar(p: Props) {
  const prefs = useDrawingPrefs();
  const [flyout, setFlyout] = useState<Flyout>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[]; label: string } | null>(null);
  const [picker, setPicker] = useState<{ def: DrawingToolDef; top: number; left: number } | null>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const groups = toolbarGroups();

  useEffect(() => {
    if (!flyout) return;
    const down = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!flyRef.current?.contains(t) && !t.closest?.("[data-flyout-toggle]")) setFlyout(null);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setFlyout(null);
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key, true);
    };
  }, [flyout]);

  const openFlyout = (id: string, el: HTMLElement) => {
    if (flyout?.id === id) return setFlyout(null);
    const r = (el.closest(".tool-group") ?? el).getBoundingClientRect();
    setFlyout({ id, top: r.top, left: r.right + 4 });
  };
  const openMenu = (el: HTMLElement, label: string, items: MenuItem[]) => {
    const r = (el.closest(".tool-group") ?? el).getBoundingClientRect();
    setMenu({ x: r.right + 4, y: r.top, items, label });
  };
  const groupOf = (type: string) => groups.find((g) => g.tools.some((t) => t.type === type))?.id ?? "";
  /**
   * Picks a tool (flyout row, group face or favorites bar). Tools with a chooser (Icon, Emoji,
   * Sticker) open it first, next to `from` (the favorites button) or the tool's toolbar group.
   */
  const pick = (def: DrawingToolDef, from?: HTMLElement) => {
    setDrawingPrefs((pr) => ({ faces: { ...pr.faces, [groupOf(def.type)]: def.type } }));
    setFlyout(null);
    if (def.picker) {
      const el = from ?? document.querySelector(`.draw-toolbar [data-group="${groupOf(def.type)}"]`) ?? document.querySelector(".draw-toolbar");
      const r = el!.getBoundingClientRect();
      const left = from ? r.left : r.right + 4;
      const top = from ? r.bottom + 4 : r.top;
      setPicker({ def, top: Math.max(4, Math.min(top, window.innerHeight - 320)), left: Math.max(4, Math.min(left, window.innerWidth - 340)) });
      return;
    }
    setPicker(null);
    p.onTool(def.type);
  };
  /** Favorites bar: tools with a chooser go through `pick`, the rest select directly. */
  const pickFavorite = (tool: Tool, from?: HTMLElement) => {
    const def = getTool(tool);
    if (def?.picker) return pick(def, from);
    setPicker(null);
    p.onTool(tool);
  };

  const cursorFace: CursorId = p.tool === "eraser" ? "eraser" : prefs.cursor;
  const cursorDef = CURSORS.find((c) => c.id === cursorFace) ?? CURSORS[0];
  const selectCursor = (id: CursorId) => {
    setFlyout(null);
    if (id === "eraser") return p.onTool("eraser");
    setDrawingPrefs({ cursor: id });
    p.onTool("cursor");
  };

  const magnetItems = (): MenuItem[] =>
    (["weak", "strong", "off"] as MagnetMode[]).map((m) => ({
      label: m === "weak" ? "Weak magnet" : m === "strong" ? "Strong magnet" : "Magnet off",
      checked: prefs.magnet === m,
      onSelect: () => setDrawingPrefs(m === "off" ? { magnet: "off" } : { magnet: m, magnetOn: m }),
    }));

  const hideAllOn = prefs.hideAll && (p.indicatorCount === 0 || p.indicatorsHidden);
  const hideItems = (): MenuItem[] => [
    { label: "Hide all drawings", shortcut: "Ctrl+Alt+H", checked: prefs.hideAll, onSelect: () => setDrawingPrefs({ hideAll: !prefs.hideAll }) },
    { label: "Hide all indicators", checked: p.indicatorsHidden, disabled: p.indicatorCount === 0, onSelect: () => p.onIndicatorsHidden(!p.indicatorsHidden) },
    { label: "Hide all positions and orders", disabled: true },
    SEP,
    {
      label: "Hide all",
      checked: hideAllOn,
      onSelect: () => {
        setDrawingPrefs({ hideAll: !hideAllOn });
        if (p.indicatorCount) p.onIndicatorsHidden(!hideAllOn);
      },
    },
  ];
  const removeItems = (): MenuItem[] => [
    { label: `Remove ${p.drawingCount} drawing${p.drawingCount === 1 ? "" : "s"}`, disabled: p.drawingCount === 0, onSelect: p.onRemoveDrawings },
    { label: `Remove ${p.indicatorCount} indicator${p.indicatorCount === 1 ? "" : "s"}`, disabled: p.indicatorCount === 0, onSelect: p.onRemoveIndicators },
    SEP,
    {
      label: "Remove drawings and indicators",
      disabled: p.drawingCount + p.indicatorCount === 0,
      onSelect: () => {
        p.onRemoveDrawings();
        p.onRemoveIndicators();
      },
    },
  ];

  const flyGroup = groups.find((g) => g.id === flyout?.id);
  const isCursor = p.tool === "cursor" || p.tool === "eraser";
  const button = (
    key: string,
    title: string,
    icon: string,
    active: boolean,
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => void,
    more?: { label: string; onClick(el: HTMLElement): void },
    extra?: Record<string, string>,
  ) => (
    <div key={key} className={`tool-group${active ? " active" : ""}`} data-group={key}>
      <button className="tool-btn" title={title} aria-label={title} aria-pressed={active} onClick={onClick} {...extra}>
        <Icon name={icon} size={28} />
      </button>
      {more && (
        <button className="tool-more" title={more.label} aria-label={more.label} onClick={(e) => more.onClick(e.currentTarget)}>
          <Icon name="chevronRight" size={11} />
        </button>
      )}
    </div>
  );

  return (
    <nav className="draw-toolbar" aria-label="Drawing tools">
      <div className={`tool-group${isCursor ? " active" : ""}`} data-group="cursors">
        <button className="tool-btn" title={`${cursorDef.label} (Esc)`} aria-label={cursorDef.label} aria-pressed={isCursor} data-cursor={cursorDef.id} onClick={() => selectCursor(cursorDef.id)}>
          <Icon name={cursorDef.icon} size={28} />
        </button>
        <button className="tool-more" data-flyout-toggle title="Cursors" aria-label="Cursors" aria-expanded={flyout?.id === "cursor"} onClick={(e) => openFlyout("cursor", e.currentTarget)}>
          <Icon name="chevronRight" size={11} />
        </button>
      </div>
      {groups.map((g) => {
        const saved = getTool(prefs.faces[g.id] ?? "");
        const faceDef = saved && g.tools.includes(saved) ? saved : g.tools[0];
        const active = g.tools.some((t) => t.type === p.tool);
        const shown = active ? (getTool(p.tool) ?? faceDef) : faceDef;
        return (
          <div key={g.id} className={`tool-group${active ? " active" : ""}`} data-group={g.id}>
            <button className="tool-btn" title={titleOf(shown)} aria-pressed={active} data-tool={shown.type} onClick={() => pick(shown)}>
              <ToolIcon def={shown} />
            </button>
            <button
              className="tool-more"
              data-flyout-toggle
              title={`Show ${g.label.toLowerCase()}`}
              aria-label={g.label}
              aria-expanded={flyout?.id === g.id}
              onClick={(e) => openFlyout(g.id, e.currentTarget)}
            >
              <Icon name="chevronRight" size={11} />
            </button>
          </div>
        );
      })}
      <div className="tool-sep" />
      {button("measure", "Measure", "measure", p.tool === "measure", () => p.onTool(p.tool === "measure" ? "cursor" : "measure"))}
      {button("zoom", "Zoom in", "zoomIn", p.tool === "zoom", () => p.onTool(p.tool === "zoom" ? "cursor" : "zoom"))}
      <div className="tool-sep" />
      {button(
        "magnet",
        `Magnet: ${prefs.magnet}`,
        "magnet",
        prefs.magnet !== "off",
        () => setDrawingPrefs({ magnet: prefs.magnet === "off" ? prefs.magnetOn : "off" }),
        { label: "Magnet mode", onClick: (el) => openMenu(el, "Magnet mode", magnetItems()) },
        { "data-magnet": prefs.magnet },
      )}
      {button("stay", "Stay in drawing mode", "stayMode", prefs.stayInDrawingMode, () => setDrawingPrefs({ stayInDrawingMode: !prefs.stayInDrawingMode }))}
      {button("lockAll", "Lock all drawings", "lockAll", prefs.lockAll, () => setDrawingPrefs({ lockAll: !prefs.lockAll }))}
      {button("hideAll", "Hide all drawings", "eyeOff", prefs.hideAll, () => setDrawingPrefs({ hideAll: !prefs.hideAll }), {
        label: "Hide options",
        onClick: (el) => openMenu(el, "Hide", hideItems()),
      })}
      <div className="tool-sep" />
      {button("remove", "Remove objects", "trash", false, (e) => openMenu(e.currentTarget, "Remove", removeItems()))}
      {button("objectTree", "Object tree", "objectTree", false, p.onObjectTree)}
      {prefs.favorites.length > 0 &&
        button(
          "favorites",
          prefs.favoritesBar.visible ? "Hide favorite drawing tools toolbar" : "Show favorite drawing tools toolbar",
          "favorites",
          prefs.favoritesBar.visible,
          () => setDrawingPrefs((pr) => ({ favoritesBar: { ...pr.favoritesBar, visible: !pr.favoritesBar.visible } })),
        )}

      {flyout && (
        <div ref={flyRef} className="tool-flyout" role="menu" aria-label={flyGroup ? flyGroup.label : "Cursors"} style={{ top: flyout.top, left: flyout.left }}>
          {flyout.id === "cursor" ? (
            <>
              {CURSORS.map((c, i) => (
                <div key={c.id}>
                  {i === 4 && <div className="flyout-sep" />}
                  <div
                    className={`flyout-row${cursorFace === c.id ? " current" : ""}`}
                    role="menuitemradio"
                    aria-checked={cursorFace === c.id}
                    data-cursor={c.id}
                    onClick={() => selectCursor(c.id)}
                  >
                    <span className="flyout-icon">
                      <Icon name={c.icon} size={28} />
                    </span>
                    <span className="flyout-label">{c.label}</span>
                    <span className="flyout-key">{c.id === "cross" ? "Esc" : ""}</span>
                    <span />
                  </div>
                </div>
              ))}
              <label className="flyout-row flyout-switch" role="menuitemcheckbox" aria-checked={prefs.valuesTooltip}>
                <span className="flyout-icon" />
                <span className="flyout-label">Values tooltip on long press</span>
                <span />
                <input type="checkbox" aria-label="Values tooltip on long press" checked={prefs.valuesTooltip} onChange={(e) => setDrawingPrefs({ valuesTooltip: e.target.checked })} />
              </label>
            </>
          ) : (
            flyGroup &&
            flyGroup.sections.map((sec, si) => (
              <div key={sec.title} role="group" aria-label={sec.title}>
                {si > 0 && <div className="flyout-sep" />}
                <div className="flyout-header">{sec.title}</div>
                {sec.tools.map((t) => {
                  const fav = prefs.favorites.includes(t.type);
                  return (
                    <div key={t.type} className={`flyout-row${p.tool === t.type ? " current" : ""}`} role="menuitem" data-tool={t.type} onClick={() => pick(t)}>
                      <span className="flyout-icon">
                        <ToolIcon def={t} />
                      </span>
                      <span className="flyout-label">{t.label}</span>
                      <span className="flyout-key">{t.hotkey ?? ""}</span>
                      <button
                        className={`flyout-star${fav ? " on" : ""}`}
                        title={fav ? "Remove from favorites" : "Add to favorites"}
                        aria-label={`${fav ? "Remove" : "Add"} ${t.label} ${fav ? "from" : "to"} favorites`}
                        aria-pressed={fav}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(t.type);
                        }}
                      >
                        <Icon name={fav ? "starFilled" : "star"} size={24} />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} label={menu.label} items={menu.items} onClose={() => setMenu(null)} />}
      {picker && (
        <div className="tool-flyout tool-picker" role="dialog" aria-label={picker.def.label} style={{ top: picker.top, left: picker.left }}>
          {picker.def.picker?.(
            (patch) => {
              setPicker(null);
              p.onTool(picker.def.type, patch);
            },
            () => setPicker(null),
          )}
        </div>
      )}
      <FavoritesBar tool={p.tool} onTool={pickFavorite} />
    </nav>
  );
}
