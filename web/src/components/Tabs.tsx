// Tab strip for settings windows (arrow keys move between tabs).

import type { KeyboardEvent } from "react";

interface Props<T extends string> {
  tabs: { id: T; label: string }[];
  value: T;
  onChange(id: T): void;
  label: string;
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: Props<T>) {
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const n = (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      onChange(tabs[n].id);
    }
  };
  return (
    <div className="tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={`tab${t.id === value ? " active" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
