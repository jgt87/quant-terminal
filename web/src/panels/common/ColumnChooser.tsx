// Column chooser popover: a button that opens a checkbox list (Esc or outside click closes).

import { useEffect, useRef, useState } from "react";
import { panelIcon } from "../panelIcons";

interface Props<K extends string> {
  options: { id: K; label: string }[];
  value: K[];
  onChange(next: K[]): void;
  title?: string;
}

export function ColumnChooser<K extends string>({ options, value, onChange, title = "Columns" }: Props<K>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const toggle = (id: K) => {
    // Keep the option order stable.
    const next = value.includes(id) ? value.filter((v) => v !== id) : options.map((o) => o.id).filter((o) => o === id || value.includes(o));
    onChange(next);
  };
  return (
    <div className="pn-pop-wrap" ref={ref}>
      <button className={`icon-btn${open ? " on" : ""}`} title={title} aria-expanded={open} onClick={() => setOpen(!open)}>
        {panelIcon("columns", 16)}
      </button>
      {open && (
        <div className="pn-pop" role="menu" aria-label={title}>
          {options.map((o) => (
            <label key={o.id} className="pn-pop-item" role="menuitemcheckbox" aria-checked={value.includes(o.id)}>
              <input type="checkbox" checked={value.includes(o.id)} onChange={() => toggle(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
