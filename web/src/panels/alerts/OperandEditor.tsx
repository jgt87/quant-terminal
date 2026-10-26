// One side of an alert condition: price field, fixed value, indicator (inputs + output) or drawing.

import { INDICATORS, getIndicator, type Drawing } from "@qt/core";
import { emptyOperand, indicatorOperand, type OperandDraft, type OperandKind } from "./alertModel";
import options from "./alertOptions.json";

interface Props {
  value: OperandDraft;
  onChange(next: OperandDraft): void;
  kinds: OperandKind[];
  drawings: Drawing[];
  label: string;
}

const SOURCES = ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"];

export function drawingLabel(d: Drawing): string {
  const p = d.anchors[0]?.price;
  return `${d.type}${d.text ? ` "${d.text}"` : ""}${p !== undefined ? ` @ ${p.toPrecision(6)}` : ""}`;
}

export function OperandEditor({ value, onChange, kinds, drawings, label }: Props) {
  const setKind = (kind: OperandKind) => {
    if (kind === value.kind) return;
    if (kind === "indicator") onChange(indicatorOperand(INDICATORS[0], emptyOperand("indicator")));
    else onChange({ ...emptyOperand(kind), value: value.value });
  };
  const def = value.kind === "indicator" ? getIndicator(value.indicatorId) : undefined;
  return (
    <div className="al-operand" role="group" aria-label={label}>
      <select value={value.kind} onChange={(e) => setKind(e.target.value as OperandKind)} aria-label={`${label} type`}>
        {options.operandKinds
          .filter((k) => kinds.includes(k.id as OperandKind))
          .map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
      </select>
      {value.kind === "price" && (
        <select value={value.field} onChange={(e) => onChange({ ...value, field: e.target.value as OperandDraft["field"] })} aria-label={`${label} field`}>
          {options.priceFields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      )}
      {value.kind === "value" && (
        <input type="text" inputMode="decimal" className="al-num" value={value.value} placeholder="0.00" aria-label={`${label} value`} onChange={(e) => onChange({ ...value, value: e.target.value })} />
      )}
      {value.kind === "indicator" && (
        <>
          <select
            value={value.indicatorId}
            aria-label={`${label} indicator`}
            onChange={(e) => {
              const d = getIndicator(e.target.value);
              if (d) onChange(indicatorOperand(d, value));
            }}
          >
            {INDICATORS.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {def && def.outputs.length > 1 && (
            <select value={value.output} onChange={(e) => onChange({ ...value, output: e.target.value })} aria-label={`${label} output`}>
              {def.outputs.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {def?.inputs.map((inp) => {
            const v = value.inputs[inp.key] ?? inp.default;
            const set = (nv: number | string | boolean) => onChange({ ...value, inputs: { ...value.inputs, [inp.key]: nv } });
            if (inp.type === "source")
              return (
                <select key={inp.key} value={String(v)} onChange={(e) => set(e.target.value)} title={inp.label} aria-label={inp.label}>
                  {SOURCES.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              );
            if (inp.type === "bool")
              return (
                <label key={inp.key} className="al-check" title={inp.label}>
                  <input type="checkbox" checked={Boolean(v)} onChange={(e) => set(e.target.checked)} />
                  {inp.label}
                </label>
              );
            return (
              <input
                key={inp.key}
                type="number"
                className="al-num small"
                value={Number(v)}
                min={inp.min}
                max={inp.max}
                step={inp.step ?? (inp.type === "int" ? 1 : 0.1)}
                title={inp.label}
                aria-label={inp.label}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n)) set(inp.type === "int" ? Math.round(n) : n);
                }}
              />
            );
          })}
        </>
      )}
      {value.kind === "drawing" && (
        <select value={value.drawingId} onChange={(e) => onChange({ ...value, drawingId: e.target.value })} aria-label={`${label} drawing`}>
          <option value="">{drawings.length ? "Choose a drawing…" : "No drawings on this chart"}</option>
          {drawings.map((d) => (
            <option key={d.id} value={d.id}>
              {drawingLabel(d)}
            </option>
          ))}
          {value.drawingId && !drawings.some((d) => d.id === value.drawingId) && <option value={value.drawingId}>Drawing {value.drawingId}</option>}
        </select>
      )}
    </div>
  );
}
