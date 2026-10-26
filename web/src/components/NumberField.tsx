// Numeric input that keeps a free-typed draft and commits a clamped number.

import { useEffect, useState } from "react";

interface Props {
  value: number;
  onChange(v: number): void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  disabled?: boolean;
  title?: string;
}

export function NumberField({ value, onChange, min, max, step, integer, disabled, title }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = (raw: string) => {
    let v = Number(raw);
    if (raw.trim() === "" || !isFinite(v)) {
      setDraft(String(value));
      return;
    }
    if (integer) v = Math.round(v);
    if (min != null) v = Math.max(min, v);
    if (max != null) v = Math.min(max, v);
    setDraft(String(v));
    if (v !== value) onChange(v);
  };

  return (
    <input
      className="num"
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      title={title}
      onChange={(e) => {
        setDraft(e.target.value);
        const v = Number(e.target.value);
        if (e.target.value.trim() !== "" && isFinite(v) && (min == null || v >= min) && (max == null || v <= max)) {
          onChange(integer ? Math.round(v) : v);
        }
      }}
      onBlur={(e) => commit(e.target.value)}
    />
  );
}
