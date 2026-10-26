// Level table of the settings window: rows of enabled · value · color, add / remove rows.

import type { FibLevel } from "@qt/core";
import type { ChartTheme } from "../../chart/theme";
import { ColorPicker } from "../ColorPicker";
import { Icon } from "../icons";
import { NumberField } from "../NumberField";
import { LineStyleSelect, WidthSelect } from "../SettingsFields";

interface Props {
  rows: FibLevel[];
  valueLabel: string;
  /** Rows also carry a line width and style. */
  lineColumns?: boolean;
  /** Rows also carry a label text. */
  textColumn?: boolean;
  theme: ChartTheme;
  onChange(rows: FibLevel[]): void;
}

export function LevelTable({ rows, valueLabel, lineColumns, textColumn, theme, onChange }: Props) {
  const set = (i: number, patch: Partial<FibLevel>) => onChange(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const add = () => {
    const last = rows[rows.length - 1];
    const color = theme.fibPalette[rows.length % theme.fibPalette.length];
    onChange([...rows, { ratio: last ? Math.round((last.ratio + 0.5) * 1000) / 1000 : 1, color, visible: true }]);
  };
  return (
    <div className={`level-table${lineColumns ? " with-lines" : ""}${textColumn ? " with-text" : ""}`} role="table" aria-label="Levels">
      <div className="level-row level-head" role="row">
        <span />
        <span>{valueLabel}</span>
        <span>Color</span>
        {lineColumns && <span>Width</span>}
        {lineColumns && <span>Style</span>}
        {textColumn && <span>Text</span>}
        <span />
      </div>
      {rows.map((l, i) => (
        <div key={i} className="level-row fib-line" role="row">
          <input type="checkbox" aria-label={`Show level ${l.ratio}`} checked={l.visible !== false} onChange={(e) => set(i, { visible: e.target.checked })} />
          <NumberField value={l.ratio} step={0.001} onChange={(ratio) => set(i, { ratio })} title={`Level ${i + 1} value`} />
          <ColorPicker label={`Level ${l.ratio}`} value={l.color ?? theme.drawing} onChange={(color) => set(i, { color })} />
          {lineColumns && <WidthSelect label={`Level ${l.ratio} width`} value={l.width ?? 1} onChange={(width) => set(i, { width })} />}
          {lineColumns && <LineStyleSelect label={`Level ${l.ratio} style`} value={l.lineStyle ?? "solid"} onChange={(lineStyle) => set(i, { lineStyle })} />}
          {textColumn && <input type="text" aria-label={`Level ${l.ratio} text`} value={l.text ?? ""} maxLength={60} onChange={(e) => set(i, { text: e.target.value || undefined })} />}
          <button type="button" className="icon-btn" title="Remove level" aria-label={`Remove level ${l.ratio}`} onClick={() => onChange(rows.filter((_, k) => k !== i))}>
            <Icon name="trash" size={14} />
          </button>
        </div>
      ))}
      <button type="button" className="btn ghost level-add" onClick={add}>
        <Icon name="plus" size={14} /> Add level
      </button>
    </div>
  );
}
