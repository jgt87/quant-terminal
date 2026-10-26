// Lays out the cells of the active tab from the grid geometry, with draggable splitters (sizes
// are committed when the drag ends) and an optional maximized cell (the others stay mounted).

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { LinkGroup } from "@qt/core";
import type { ThemeMode } from "../../chart/theme";
import { cellCount, cellRects, dragSplitter, splitters, type Splitter } from "../../state/grid";
import { activeCellOf, type TabState } from "../../state/workspace";
import { ChartCell, type CellContext } from "./ChartCell";

interface Props {
  tab: TabState;
  linkGroups: LinkGroup[];
  maximized: number | null;
  theme: ThemeMode;
  showVolume: boolean;
  ctx: CellContext;
  onSizes(sizes: number[]): void;
}

const pct = (v: number) => `${(v * 100).toFixed(4)}%`;

export function ChartGrid({ tab, linkGroups, maximized, theme, showVolume, ctx, onSizes }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState<number[] | null>(null);
  const drag = useRef<{ s: Splitter; start: number; startSizes: number[]; px: number; last: number[] | null } | null>(null);
  const sizes = live ?? tab.sizes;
  const count = cellCount(tab.grid);
  const rects = cellRects(tab.grid, sizes);
  const active = activeCellOf(tab);
  const multi = count > 1;

  // A different tab or grid drops any drag in progress.
  useEffect(() => setLive(null), [tab.id, tab.grid]);

  const onDown = (s: Splitter) => (ev: ReactPointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 || !root.current) return;
    ev.preventDefault();
    const box = root.current.getBoundingClientRect();
    drag.current = { s, start: s.axis === "col" ? ev.clientX : ev.clientY, startSizes: sizes ?? [], last: null, px: s.axis === "col" ? box.width : box.height };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const onMove = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.px <= 0) return;
    const delta = ((d.s.axis === "col" ? ev.clientX : ev.clientY) - d.start) / d.px;
    d.last = dragSplitter(tab.grid, d.startSizes, d.s.axis, d.s.index, delta);
    setLive(d.last);
  };
  const onUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (d.last) onSizes(d.last);
    setLive(null);
  };

  return (
    <div className={`chart-grid${multi ? " multi" : ""}${maximized != null ? " has-max" : ""}`} ref={root} data-grid={tab.grid} data-tab={tab.id}>
      {tab.cells.slice(0, count).map((c, i) => {
        const r = rects[i];
        const isMax = maximized === i;
        const hidden = maximized != null && !isMax;
        return (
          <div
            key={`${tab.id}:${i}:${c.layoutId}`}
            className={`grid-slot${hidden ? " hidden" : ""}`}
            style={isMax ? { left: 0, top: 0, width: "100%", height: "100%" } : { left: pct(r.left), top: pct(r.top), width: pct(r.width), height: pct(r.height) }}
          >
            <ChartCell
              index={i}
              layoutId={c.layoutId}
              link={c.link}
              linkGroups={linkGroups}
              active={i === active}
              showHeader={multi}
              maximized={isMax}
              theme={theme}
              showVolume={showVolume}
              ctx={ctx}
            />
          </div>
        );
      })}
      {maximized == null &&
        splitters(tab.grid, sizes).map((s) => (
          <div
            key={`${s.axis}${s.index}`}
            className={`grid-splitter ${s.axis}`}
            role="separator"
            aria-orientation={s.axis === "col" ? "vertical" : "horizontal"}
            aria-label={`Resize ${s.axis === "col" ? "columns" : "rows"}`}
            style={
              s.axis === "col"
                ? { left: pct(s.pos), top: pct(s.start), height: pct(s.end - s.start) }
                : { top: pct(s.pos), left: pct(s.start), width: pct(s.end - s.start) }
            }
            onPointerDown={onDown(s)}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
        ))}
    </div>
  );
}
