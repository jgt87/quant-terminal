// Color field used by every settings window and the floating toolbar: a compact swatch (or an
// icon with a color bar) that opens a popover with a 10-column palette, a hex input, an opacity
// slider and, for line colors, thickness and line-style segments. Value is "#rrggbb[aa]".

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { LineStyle } from "@qt/core";
import swatches from "../config/colorSwatches.json";
import { parseHex, toHex } from "./colorValue";
import { Icon } from "./icons";
import "../styles/colorpicker.css";

interface Props {
  value: string;
  onChange(v: string): void;
  label: string;
  /** Hide the opacity slider (e.g. background colors stored with a separate opacity). */
  noAlpha?: boolean;
  /** Line colors: thickness (1–4 px) and line style segments under the palette. */
  line?: { width: number; style: LineStyle; onWidth(w: number): void; onStyle(s: LineStyle): void };
  /** Floating toolbar: an icon button with a 4px color bar instead of the swatch. */
  icon?: string;
  title?: string;
  /** Offers "Reset" that removes the value (fields that may be unset, e.g. "Use one color"). */
  onClear?(): void;
}

const PALETTE = (swatches as unknown as (string | string[])[]).flat();
const STYLES: { id: LineStyle; icon: string; label: string }[] = [
  { id: "solid", icon: "lineSolid", label: "Solid" },
  { id: "dashed", icon: "lineDashed", label: "Dashed" },
  { id: "dotted", icon: "lineDotted", label: "Dotted" },
];

export function ColorPicker({ value, onChange, label, noAlpha, line, icon, title, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const parsed = parseHex(value) ?? { hex: "#2962ff", alpha: 1 };
  const [hexText, setHexText] = useState(parsed.hex);
  const root = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const toggle = (el: HTMLElement) => {
    if (open) return setOpen(false);
    // The popover is fixed-positioned (portal) so dialogs and toolbars never clip it.
    const r = el.getBoundingClientRect();
    const w = 252;
    const h = 330;
    const left = Math.max(4, Math.min(window.innerWidth - w - 4, r.right - w));
    const top = r.bottom + 4 + h > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 4;
    setAt({ left, top });
    setOpen(true);
  };

  useEffect(() => setHexText(parsed.hex), [parsed.hex]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node) && !pop.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const set = (hex: string, alpha = parsed.alpha) => onChange(toHex(hex, noAlpha ? 1 : alpha));
  const pct = Math.round(parsed.alpha * 100);

  return (
    <div className="color-field" ref={root}>
      {icon ? (
        <button type="button" className="icon-btn fb-color-btn" aria-label={`${label} color`} aria-expanded={open} title={title ?? value} onClick={(e) => toggle(e.currentTarget)}>
          <Icon name={icon} size={18} />
          <span className="fb-color-bar" style={{ background: value }} />
        </button>
      ) : (
        <button type="button" className="color-swatch-btn" aria-label={`${label} color`} aria-expanded={open} title={value} onClick={(e) => toggle(e.currentTarget)}>
          <span className="color-chip" style={{ background: value }} />
        </button>
      )}
      {open &&
        createPortal(
        <div ref={pop} className="color-pop" role="dialog" aria-label={`${label} color`} style={at ? { position: "fixed", left: at.left, top: at.top, right: "auto" } : undefined}>
          <div className="color-grid">
            {PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                className={`color-cell${c === parsed.hex ? " selected" : ""}`}
                style={{ background: c }}
                aria-label={c}
                title={c}
                onClick={() => set(c)}
              />
            ))}
          </div>
          <div className="color-divider" />
          <label className="color-row">
            <span>Hex</span>
            <input
              type="text"
              value={hexText}
              maxLength={7}
              spellCheck={false}
              aria-label="Hex color"
              onChange={(e) => {
                setHexText(e.target.value);
                const p = parseHex(e.target.value);
                if (p) set(p.hex);
              }}
            />
          </label>
          {!noAlpha && (
            <label className="color-row">
              <span>Opacity</span>
              <input type="range" min={0} max={100} value={pct} aria-label="Opacity" onChange={(e) => set(parsed.hex, Number(e.target.value) / 100)} />
              <span className="color-pct">{pct}%</span>
            </label>
          )}
          {onClear && (
            <button
              type="button"
              className="btn ghost color-clear"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Reset
            </button>
          )}
          {line && (
            <>
              <div className="color-seg-title">Thickness</div>
              <div className="color-seg" role="radiogroup" aria-label="Thickness">
                {[1, 2, 3, 4].map((w) => (
                  <button key={w} type="button" role="radio" aria-checked={line.width === w} className={line.width === w ? "on" : ""} title={`${w}px`} onClick={() => line.onWidth(w)}>
                    <span className="seg-line" style={{ height: w }} />
                  </button>
                ))}
              </div>
              <div className="color-seg-title">Line style</div>
              <div className="color-seg" role="radiogroup" aria-label="Line style">
                {STYLES.map((s) => (
                  <button key={s.id} type="button" role="radio" aria-checked={line.style === s.id} className={line.style === s.id ? "on" : ""} title={s.label} onClick={() => line.onStyle(s.id)}>
                    <Icon name={s.icon} size={16} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>,
          document.body,
        )}
    </div>
  );
}
