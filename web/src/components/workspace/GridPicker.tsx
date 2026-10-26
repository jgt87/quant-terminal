// Toolbar button that picks the chart grid of the active tab (1 to 16 charts).

import { useCallback, useRef, useState } from "react";
import type { GridKind } from "@qt/core";
import { cellCount, GRID_KINDS } from "../../state/grid";
import { GridIcon } from "./GridIcon";
import { useDismiss } from "./useDismiss";

interface Props {
  value: GridKind;
  onChange(kind: GridKind): void;
}

export function GridPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, [ref], close);

  return (
    <div className="dropdown" ref={ref}>
      <button
        className={`tb-btn${open ? " active" : ""}`}
        title="Chart grid"
        aria-label="Chart grid"
        aria-haspopup="menu"
        aria-expanded={open}
        data-grid={value}
        onClick={() => setOpen((o) => !o)}
      >
        <GridIcon kind={value} />
      </button>
      {open && (
        <div className="grid-menu" role="menu" aria-label="Chart grid">
          {GRID_KINDS.map((k) => (
            <button
              key={k}
              role="menuitemradio"
              aria-checked={k === value}
              aria-label={`${cellCount(k)} chart${cellCount(k) > 1 ? "s" : ""} (${k})`}
              title={`${cellCount(k)} chart${cellCount(k) > 1 ? "s" : ""}`}
              data-grid={k}
              className={`grid-option${k === value ? " active" : ""}`}
              onClick={() => {
                onChange(k);
                setOpen(false);
              }}
            >
              <GridIcon kind={k} size={26} />
              <span>{k}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
