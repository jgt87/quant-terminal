// Small form fields shared by the settings windows.

import type { LineStyle } from "@qt/core";
import type { ReactNode } from "react";

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="form-row">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function LineStyleSelect({ value, onChange, label = "Line style" }: { value: LineStyle; onChange(v: LineStyle): void; label?: string }) {
  return (
    <select value={value} aria-label={label} onChange={(e) => onChange(e.target.value as LineStyle)}>
      <option value="solid">Solid</option>
      <option value="dashed">Dashed</option>
      <option value="dotted">Dotted</option>
    </select>
  );
}

export function WidthSelect({ value, onChange, label = "Line width" }: { value: number; onChange(v: number): void; label?: string }) {
  return (
    <select value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))}>
      {[1, 2, 3, 4].map((w) => (
        <option key={w} value={w}>
          {w}px
        </option>
      ))}
    </select>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange(v: boolean): void; label: string }) {
  return (
    <label className="form-row">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

export function Percent({ value, onChange, label }: { value: number; onChange(v: number): void; label: string }) {
  return (
    <label className="form-row">
      <span>{label}</span>
      <span className="range-field">
        <input type="range" min={0} max={100} value={Math.round(value * 100)} aria-label={label} onChange={(e) => onChange(Number(e.target.value) / 100)} />
        <span className="range-val">{Math.round(value * 100)}%</span>
      </span>
    </label>
  );
}
