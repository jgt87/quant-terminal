// The app's right-click menu: keyboard (arrows / Enter / Esc / Left-Right for submenus), checkable
// and disabled items, separators, right-aligned shortcut hints and submenus. It stays inside the
// viewport and closes on outside click, scroll, resize and window blur.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./icons";
import { placeMenu, placeSubmenu, type Rect } from "./menuPosition";
import { isAction, isHeader, type MenuAction, type MenuItem } from "./menuTypes";
import "../styles/contextmenu.css";

interface Props {
  x: number;
  y: number;
  items: MenuItem[];
  onClose(): void;
  label?: string;
}

export function ContextMenu({ x, y, items, onClose, label = "Context menu" }: Props) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const outside = (e: Event) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.(".ctx-menu")) close.current();
    };
    const always = () => close.current();
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("wheel", outside, { capture: true, passive: true });
    window.addEventListener("scroll", outside, true);
    window.addEventListener("resize", always);
    window.addEventListener("blur", always);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("wheel", outside, true);
      window.removeEventListener("scroll", outside, true);
      window.removeEventListener("resize", always);
      window.removeEventListener("blur", always);
    };
  }, []);

  return <MenuList items={items} anchor={{ kind: "point", x, y }} onClose={() => close.current()} label={label} autoFocus />;
}

type Anchor = { kind: "point"; x: number; y: number } | { kind: "item"; rect: Rect };

interface ListProps {
  items: MenuItem[];
  anchor: Anchor;
  label: string;
  autoFocus?: boolean;
  onClose(): void;
  /** Submenus: Left/Esc returns focus to the parent. */
  onBack?(): void;
}

function MenuList({ items, anchor, label, autoFocus, onClose, onBack }: ListProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState<{ index: number; rect: Rect; focus: boolean } | null>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    setPos(anchor.kind === "point" ? placeMenu(anchor.x, anchor.y, w, h, vw, vh) : placeSubmenu(anchor.rect, w, h, vw, vh));
    // Placement is computed once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const enabled = (i: number) => {
    const m = items[i];
    return Boolean(m && isAction(m) && !m.disabled);
  };
  const step = (from: number, dir: 1 | -1) => {
    for (let k = 1; k <= items.length; k++) {
      const i = (((from + dir * k) % items.length) + items.length) % items.length;
      if (enabled(i)) return i;
    }
    return from;
  };

  const openSub = (i: number, focus: boolean) => {
    const el = itemRefs.current[i];
    if (!el) return;
    const r = el.getBoundingClientRect();
    setOpen({ index: i, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, focus });
  };

  const choose = (m: MenuAction, i: number) => {
    if (m.disabled) return;
    if (m.submenu) {
      openSub(i, true);
      return;
    }
    onClose();
    m.onSelect?.();
  };

  const onKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    const m = items[active];
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive((a) => step(a < 0 ? -1 : a, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActive((a) => step(a < 0 ? items.length : a, -1));
        break;
      case "ArrowRight":
        e.preventDefault();
        if (m && isAction(m) && m.submenu && !m.disabled) openSub(active, true);
        break;
      case "ArrowLeft":
        e.preventDefault();
        onBack?.();
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (m && isAction(m)) choose(m, active);
        break;
      case "Escape":
        e.preventDefault();
        if (onBack) onBack();
        else onClose();
        break;
      case "Tab":
        e.preventDefault();
        break;
    }
  };

  const sub = open ? items[open.index] : null;

  return (
    <>
      <div
        ref={ref}
        className="ctx-menu"
        role="menu"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={onKey}
        onContextMenu={(e) => e.preventDefault()}
        style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}
      >
        {items.map((m, i) =>
          isHeader(m) ? (
            <div key={i} className="ctx-header" role="presentation">
              {m.label}
            </div>
          ) : !isAction(m) ? (
            <div key={i} className="ctx-sep" role="separator" />
          ) : (
            <div
              key={i}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              role={m.checked === undefined ? "menuitem" : "menuitemcheckbox"}
              aria-checked={m.checked === undefined ? undefined : m.checked}
              aria-disabled={m.disabled || undefined}
              aria-haspopup={m.submenu ? "menu" : undefined}
              aria-expanded={m.submenu ? open?.index === i : undefined}
              className={`ctx-item${i === active ? " active" : ""}${m.disabled ? " disabled" : ""}`}
              onMouseEnter={() => {
                setActive(i);
                if (m.submenu && !m.disabled) openSub(i, false);
                else setOpen(null);
              }}
              onClick={() => choose(m, i)}
            >
              <span className={`ctx-check${m.checked ? " on" : ""}`}>{m.checked ? <Icon name="check" size={14} /> : m.icon ? <Icon name={m.icon} size={16} /> : null}</span>
              <span className="ctx-label">{m.label}</span>
              <span className="ctx-shortcut">{m.shortcut ?? ""}</span>
              <span className="ctx-arrow">{m.submenu ? <Icon name="chevronRight" size={12} /> : null}</span>
            </div>
          ),
        )}
      </div>
      {open && sub && isAction(sub) && sub.submenu && (
        <MenuList
          key={open.index}
          items={sub.submenu}
          anchor={{ kind: "item", rect: open.rect }}
          label={sub.label}
          autoFocus={open.focus}
          onClose={onClose}
          onBack={() => {
            setOpen(null);
            ref.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </>
  );
}
