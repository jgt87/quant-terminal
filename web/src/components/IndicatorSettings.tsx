// Indicator settings window: Inputs (from the indicator's input schema), Style (per output:
// visible, color, width, line style; guide levels) and Visibility tabs. Edits preview live;
// Cancel restores the instance as it was.

import { useState } from "react";
import { anyIndicator, isStudy } from "../chart/studies/defs";
import timeframes from "../config/timeframes.json";
import type { IndicatorInstance, InputValue, OutputStyle } from "@qt/core";
import { outputStyle } from "../chart/indicatorStyle";
import type { ChartTheme } from "../chart/theme";
import sources from "../config/sources.json";
import { ColorPicker } from "./ColorPicker";
import { NumberField } from "./NumberField";
import { SettingsDialog } from "./SettingsDialog";
import { Check, LineStyleSelect, WidthSelect } from "./SettingsFields";
import { VisibilityFields } from "./VisibilityFields";

type Tab = "inputs" | "style" | "visibility";

interface Props {
  instance: IndicatorInstance;
  /** Position among the layout's indicators (drives the default palette color). */
  ordinal: number;
  theme: ChartTheme;
  /** Called with every edit (live preview) and with the original on Cancel. */
  onChange(next: IndicatorInstance): void;
  onClose(): void;
  initialTab?: Tab;
}

export function IndicatorSettings({ instance, ordinal, theme, onChange, onClose, initialTab }: Props) {
  const def = anyIndicator(instance.indicatorId);
  const [original] = useState(instance);
  const [inst, setInst] = useState<IndicatorInstance>(() => {
    const v: Record<string, InputValue> = {};
    for (const i of def?.inputs ?? []) v[i.key] = instance.inputs[i.key] ?? i.default;
    return { ...instance, inputs: v };
  });
  if (!def) return null;

  const apply = (next: IndicatorInstance) => {
    setInst(next);
    onChange(next);
  };
  const setInput = (k: string, v: InputValue) => apply({ ...inst, inputs: { ...inst.inputs, [k]: v } });
  const setOut = (key: string, patch: Partial<OutputStyle>) =>
    apply({ ...inst, style: { ...inst.style, outputs: { ...inst.style?.outputs, [key]: { ...inst.style?.outputs?.[key], ...patch } } } });
  const styled = { def, ordinal, style: inst.style };
  const hasLevels = Boolean(def.levels?.length) || def.outputs.some((o) => o.style === "histogram");

  return (
    <SettingsDialog<Tab>
      title={`${def.name} settings`}
      tabs={[
        { id: "inputs", label: "Inputs" },
        { id: "style", label: "Style" },
        { id: "visibility", label: "Visibility" },
      ]}
      initialTab={initialTab}
      width={480}
      onOk={onClose}
      onCancel={() => {
        onChange(original);
        onClose();
      }}
      onDefaults={() => {
        const v: Record<string, InputValue> = {};
        for (const i of def.inputs) v[i.key] = i.default;
        apply({ ...inst, inputs: v, style: undefined, visibility: undefined, timeframe: undefined });
      }}
    >
      {(tab) => {
        if (tab === "inputs")
          return (
            <>
              {def.inputs.length === 0 && <p className="muted">This indicator has no inputs.</p>}
              {!isStudy(def) && (
                <label className="form-row">
                  <span>Timeframe</span>
                  <select
                    aria-label="Timeframe"
                    value={inst.timeframe ?? ""}
                    onChange={(e) => apply({ ...inst, timeframe: e.target.value || undefined })}
                    title="Compute on a higher timeframe (aligned without look-ahead)"
                  >
                    {timeframes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {def.inputs.map((inp) => (
                <label key={inp.key} className="form-row">
                  <span>{inp.label}</span>
                  {inp.type === "source" ? (
                    <select value={String(inst.inputs[inp.key])} onChange={(e) => setInput(inp.key, e.target.value)}>
                      {sources.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  ) : inp.type === "bool" ? (
                    <input type="checkbox" checked={Boolean(inst.inputs[inp.key])} onChange={(e) => setInput(inp.key, e.target.checked)} />
                  ) : (
                    <NumberField
                      value={Number(inst.inputs[inp.key])}
                      min={inp.min}
                      max={inp.max}
                      step={inp.step ?? (inp.type === "int" ? 1 : 0.1)}
                      integer={inp.type === "int"}
                      title={inp.label}
                      onChange={(v) => setInput(inp.key, v)}
                    />
                  )}
                </label>
              ))}
            </>
          );
        if (tab === "style")
          return (
            <>
              {def.outputs.map((out, j) => {
                const s = outputStyle(theme, styled, j, out);
                const hist = out.style === "histogram";
                return (
                  <div key={out.key} className="style-line">
                    <input type="checkbox" aria-label={`Show ${out.label}`} checked={s.visible} onChange={(e) => setOut(out.key, { visible: e.target.checked })} />
                    <span>{out.label}</span>
                    {hist && !inst.style?.outputs?.[out.key]?.color ? (
                      <button type="button" className="btn ghost" onClick={() => setOut(out.key, { color: theme.indicatorPalette[0] })} title="Use one color instead of up/down">
                        Up/down
                      </button>
                    ) : (
                      <ColorPicker label={out.label} value={s.color} onChange={(color) => setOut(out.key, { color })} />
                    )}
                    {hist ? <span /> : <WidthSelect value={s.width} onChange={(width) => setOut(out.key, { width })} label={`${out.label} width`} />}
                    {hist ? <span /> : <LineStyleSelect value={s.lineStyle} onChange={(lineStyle) => setOut(out.key, { lineStyle })} label={`${out.label} line style`} />}
                  </div>
                );
              })}
              {hasLevels && (
                <Check
                  label={`Level lines${def.levels?.length ? ` (${def.levels.join(" / ")})` : " (zero)"}`}
                  checked={inst.style?.levels !== false}
                  onChange={(levels) => apply({ ...inst, style: { ...inst.style, levels } })}
                />
              )}
            </>
          );
        return <VisibilityFields value={inst.visibility} onChange={(visibility) => apply({ ...inst, visibility })} />;
      }}
    </SettingsDialog>
  );
}
