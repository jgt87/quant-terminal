// "Custom…" interval picker of the toolbar: presets plus free entry ("2h", "3D", "45m").

import { useEffect, useRef, useState } from "react";
import presets from "../config/customIntervals.json";
import { parseIntervalSpec, providerIntervalFor } from "../data/intervalSpec";
import { Icon } from "./icons";

interface Props {
  /** Current custom interval, if any. */
  value?: string;
  onPick(spec: string): void;
}

export function CustomIntervalMenu({ value, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const spec = parseIntervalSpec(text);
  const valid = spec && providerIntervalFor(spec);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (s: string) => {
    const p = parseIntervalSpec(s);
    if (!p || !providerIntervalFor(p)) return;
    onPick(p.text);
    setOpen(false);
    setText("");
  };

  return (
    <div className="dropdown custom-interval" ref={ref}>
      <button
        className={`tb-btn interval${value ? " active" : ""}`}
        title="Custom interval"
        aria-label="Custom interval"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-pressed={!!value}
        onClick={() => setOpen((o) => !o)}
      >
        {value ?? "Custom…"}
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="dropdown-menu custom-interval-menu" role="menu">
          <div className="ci-presets">
            {(presets as string[]).map((s) => (
              <button key={s} role="menuitemradio" aria-checked={s === value} className={s === value ? "active" : ""} onClick={() => pick(s)}>
                {s}
              </button>
            ))}
          </div>
          <form
            className="ci-form"
            onSubmit={(e) => {
              e.preventDefault();
              pick(text);
            }}
          >
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 2h, 3D, 45m"
              aria-label="Custom interval value"
              spellCheck={false}
            />
            <button type="submit" className="btn primary" disabled={!valid}>
              Apply
            </button>
          </form>
          {text && !valid && <p className="ci-error">Use minutes (m), hours (h), days (D) or weeks (W)</p>}
        </div>
      )}
    </div>
  );
}
