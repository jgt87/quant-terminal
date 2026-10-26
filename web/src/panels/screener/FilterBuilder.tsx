// Screener filter rows: field, operator, value (or two values, or another field).

import type { ScreenerField, ScreenerFilter } from "@qt/core";
import { Icon } from "../../components/icons";
import { FIELDS, isFieldOp, newFilter, OPS, type FilterDraft } from "./screenerModel";

interface Props {
  filters: FilterDraft[];
  onChange(next: FilterDraft[]): void;
  onSubmit(): void;
}

function FieldSelect({ value, onChange, label }: { value: ScreenerField; onChange(f: ScreenerField): void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as ScreenerField)} aria-label={label}>
      {FIELDS.map((f) => (
        <option key={f.id} value={f.id}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

export function FilterBuilder({ filters, onChange, onSubmit }: Props) {
  const set = (i: number, patch: Partial<FilterDraft>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="sc-filters" onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && onSubmit()}>
      {filters.map((f, i) => (
        <div className="sc-filter" key={i} data-filter={i}>
          <FieldSelect value={f.field} onChange={(field) => set(i, { field })} label={`Filter ${i + 1} field`} />
          <select value={f.op} onChange={(e) => set(i, { op: e.target.value as ScreenerFilter["op"] })} aria-label={`Filter ${i + 1} operator`} className="sc-op">
            {OPS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          {isFieldOp(f.op) ? (
            <FieldSelect value={f.otherField} onChange={(otherField) => set(i, { otherField })} label={`Filter ${i + 1} other field`} />
          ) : (
            <>
              <input type="text" inputMode="decimal" className="sc-val" value={f.value} placeholder="value" onChange={(e) => set(i, { value: e.target.value })} aria-label={`Filter ${i + 1} value`} />
              {f.op === "between" && (
                <input type="text" inputMode="decimal" className="sc-val" value={f.value2} placeholder="and" onChange={(e) => set(i, { value2: e.target.value })} aria-label={`Filter ${i + 1} upper value`} />
              )}
            </>
          )}
          <button className="icon-btn" title="Remove filter" onClick={() => onChange(filters.filter((_, j) => j !== i))}>
            <Icon name="close" size={12} />
          </button>
        </div>
      ))}
      <button className="btn ghost sc-add" onClick={() => onChange([...filters, newFilter()])} disabled={filters.length >= 50}>
        + Filter
      </button>
    </div>
  );
}
