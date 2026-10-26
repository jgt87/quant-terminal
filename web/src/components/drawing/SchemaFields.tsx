// Renders the fields of a tool's settings schema (one tab) as two-column label/control rows:
// color(+opacity), opacity, width, line style, checkbox, number, select, text (multiline), font
// size, level table and section headers.

import type { Drawing, FibLevel } from "@qt/core";
import { fieldSet, fieldValue, FONT_SIZES } from "../../chart/drawings/schema";
import type { SettingsField } from "../../chart/drawings/types";
import type { ChartTheme } from "../../chart/theme";
import { ColorPicker } from "../ColorPicker";
import { NumberField } from "../NumberField";
import { Check, LineStyleSelect, Percent, Row, WidthSelect } from "../SettingsFields";
import { LevelTable } from "./LevelTable";

interface Props {
  fields: SettingsField[];
  drawing: Drawing;
  theme: ChartTheme;
  onChange(d: Drawing): void;
}

export function SchemaFields({ fields, drawing: d, theme, onChange }: Props) {
  return (
    <>
      {fields.map((f, i) => {
        if (f.showIf && !f.showIf(d)) return null;
        if (f.kind === "section") return <div key={`s${i}`} className="settings-section">{f.label}</div>;
        return (
          <div key={f.key} className="field-wrap" data-field={f.key} data-kind={f.kind}>
            {control(f, d, theme, onChange)}
          </div>
        );
      })}
    </>
  );
}

/** The control of one value field (exported for the harness: every field must render a control). */
export function control(f: Exclude<SettingsField, { kind: "section" }>, d: Drawing, theme: ChartTheme, onChange: (d: Drawing) => void) {
        const v = fieldValue(d, f, theme);
        const set = (value: unknown) => onChange(fieldSet(d, f, value));
        const k = f.key;
        switch (f.kind) {
          case "color":
            return (
              <Row key={k} label={f.label === "Line" ? "Color" : f.label}>
                <ColorPicker
                  label={f.label}
                  value={String(v ?? theme.drawing)}
                  noAlpha={f.alpha === false}
                  onChange={set}
                  onClear={f.clearable || f.default === undefined ? () => set(undefined) : undefined}
                />
              </Row>
            );
          case "opacity":
            return <Percent key={k} label={f.label} value={Number(v ?? 1)} onChange={set} />;
          case "width":
            return (
              <Row key={k} label={f.label}>
                <WidthSelect value={Number(v ?? 1)} onChange={set} />
              </Row>
            );
          case "lineStyle":
            return (
              <Row key={k} label={f.label}>
                <LineStyleSelect value={(v as "solid") ?? "solid"} onChange={set} />
              </Row>
            );
          case "checkbox":
            return <Check key={k} label={f.label} checked={Boolean(v)} onChange={set} />;
          case "number":
            return (
              <Row key={k} label={f.label}>
                <NumberField value={Number(v ?? 0)} min={f.min} max={f.max} step={f.step} title={f.label} onChange={set} />
              </Row>
            );
          case "select":
            return (
              <Row key={k} label={f.label}>
                <select
                  value={String(v ?? "")}
                  aria-label={f.label}
                  onChange={(e) => set(f.options.find((o) => String(o.value) === e.target.value)?.value ?? e.target.value)}
                >
                  {f.options.map((o) => (
                    <option key={String(o.value)} value={String(o.value)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Row>
            );
          case "text":
            return (
              <Row key={k} label={f.label}>
                {f.multiline ? (
                  <textarea rows={3} value={String(v ?? "")} maxLength={f.maxLength} aria-label={f.label} onChange={(e) => set(e.target.value)} />
                ) : (
                  <input type="text" value={String(v ?? "")} maxLength={f.maxLength ?? 120} aria-label={f.label} onChange={(e) => set(e.target.value)} />
                )}
              </Row>
            );
          case "fontSize":
            return (
              <Row key={k} label={f.label}>
                <select value={Number(v ?? 11)} aria-label={f.label} onChange={(e) => set(Number(e.target.value))}>
                  {(f.sizes ?? FONT_SIZES).map((s) => (
                    <option key={s} value={s}>
                      {s}px
                    </option>
                  ))}
                </select>
              </Row>
            );
          case "levels": {
            const rows = (Array.isArray(v) && v.length ? v : f.defaults(theme)) as FibLevel[];
            return <LevelTable key={k} rows={rows} valueLabel={f.valueLabel ?? "Value"} lineColumns={f.lineColumns} textColumn={f.textColumn} theme={theme} onChange={(next) => set(next)} />;
          }
        }
        return null;
}
