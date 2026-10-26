// Cell header link button: none or one of the nine link colors, plus the group's channel
// toggles (symbol, interval, time range) in a small popover.

import { useCallback, useRef, useState } from "react";
import type { LinkColor, LinkGroup } from "@qt/core";
import { groupFor, LINK_COLORS } from "../../state/links";
import { useDismiss } from "./useDismiss";

interface Props {
  color?: LinkColor;
  groups: LinkGroup[];
  onPick(color: LinkColor | undefined): void;
  onGroup(group: LinkGroup): void;
}

const CHANNELS: { key: "symbol" | "interval" | "time"; label: string }[] = [
  { key: "symbol", label: "Symbol" },
  { key: "interval", label: "Interval" },
  { key: "time", label: "Time range" },
];

export function LinkButton({ color, groups, onPick, onGroup }: Props) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setPos(null), []);
  useDismiss(pos !== null, [btn, pop], close);
  const group = color ? groupFor(groups, color) : null;

  return (
    <>
      <button
        ref={btn}
        className={`cell-btn link-btn${color ? ` link-${color}` : ""}`}
        title={color ? `Linked: ${color} group` : "Link to a color group"}
        aria-label={color ? `Link group ${color}` : "Link group none"}
        aria-haspopup="dialog"
        aria-expanded={pos !== null}
        data-link={color ?? "none"}
        onClick={() => {
          if (pos) return close();
          const r = btn.current!.getBoundingClientRect();
          setPos({ x: Math.max(4, Math.min(window.innerWidth - 204, r.left)), y: r.bottom + 4 });
        }}
      >
        <span className="link-dot" />
      </button>
      {pos && (
        <div ref={pop} className="link-pop" role="dialog" aria-label="Link group" style={{ left: pos.x, top: pos.y }}>
          <div className="link-swatches">
            <button className={`link-swatch none${!color ? " selected" : ""}`} title="No link" aria-label="No link" onClick={() => onPick(undefined)}>
              <span className="link-dot" />
            </button>
            {LINK_COLORS.map((c) => (
              <button
                key={c}
                className={`link-swatch link-${c}${c === color ? " selected" : ""}`}
                title={`${c[0].toUpperCase()}${c.slice(1)} group`}
                aria-label={`Link ${c}`}
                aria-pressed={c === color}
                onClick={() => onPick(c)}
              >
                <span className="link-dot" />
              </button>
            ))}
          </div>
          {group && (
            <div className="link-channels">
              <span className="link-channels-title">Shared in this group</span>
              {CHANNELS.map((ch) => (
                <label key={ch.key} className="link-channel">
                  <input type="checkbox" checked={group[ch.key]} onChange={(e) => onGroup({ ...group, [ch.key]: e.target.checked })} />
                  <span>{ch.label}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
