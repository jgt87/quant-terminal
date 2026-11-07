// Small popup menu anchored under a toolbar button.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons";
import { t } from "../i18n";

interface Option {
  id: string;
  label: string;
}

interface Props {
  value: string;
  options: Option[];
  onChange(id: string): void;
  icon?: ReactNode;
  title?: string;
}

export function Dropdown({ value, options, onChange, icon, title }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.id === value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="dropdown" ref={ref}>
      <button className="tb-btn" title={title} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {icon}
        <span>{current ? t(current.label) : value}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <ul className="dropdown-menu" role="menu">
          {options.map((o) => (
            <li key={o.id}>
              <button
                role="menuitemradio"
                aria-checked={o.id === value}
                className={o.id === value ? "active" : ""}
                onClick={() => {
                  onChange(o.id);
                  setOpen(false);
                }}
              >
                {t(o.label)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
