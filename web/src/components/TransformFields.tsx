// Chart settings › Symbol: parameters of the price-only chart types (renko, kagi, line break,
// point & figure, range bars) and the baseline price.

import { TRANSFORM_DEFAULTS, type ChartType, type TransformOptions } from "@qt/core";
import { transformOf } from "../chart/transform";
import { NumberField } from "./NumberField";
import { Row } from "./SettingsFields";

interface Props {
  chartType: ChartType;
  value: TransformOptions | undefined;
  onChange(next: TransformOptions): void;
  baseline: number | undefined;
  onBaseline(v: number | undefined): void;
}

export function TransformFields({ chartType, value, onChange, baseline, onBaseline }: Props) {
  const kind = transformOf(chartType);
  if (chartType === "baseline") {
    return (
      <>
        <div className="settings-section">Baseline</div>
        <Row label="Base price (empty = first visible close)">
          <input
            type="number"
            step="any"
            aria-label="Base price"
            value={baseline ?? ""}
            onChange={(e) => onBaseline(e.target.value === "" ? undefined : Number(e.target.value))}
          />
        </Row>
      </>
    );
  }
  if (!kind) return null;
  const o = { ...TRANSFORM_DEFAULTS, ...value };
  const set = <K extends keyof TransformOptions>(k: K, patch: Partial<NonNullable<TransformOptions[K]>>) =>
    onChange({ ...value, [k]: { ...TRANSFORM_DEFAULTS[k], ...value?.[k], ...patch } });
  const boxField = (k: "renko" | "pnf") => {
    const box = o[k]!.boxSize;
    const atr = box === "atr";
    return (
      <>
        <Row label="Box size">
          <select aria-label="Box size mode" value={atr ? "atr" : "fixed"} onChange={(e) => set(k, { boxSize: e.target.value === "atr" ? "atr" : 1 })}>
            <option value="atr">ATR</option>
            <option value="fixed">Fixed</option>
          </select>
        </Row>
        {atr ? (
          <Row label="ATR length">
            <NumberField value={o[k]!.atrLength ?? 14} min={1} max={500} step={1} integer title="ATR length" onChange={(v) => set(k, { atrLength: v })} />
          </Row>
        ) : (
          <Row label="Box size (price)">
            <NumberField value={box as number} min={0} step={0.01} title="Box size" onChange={(v) => v > 0 && set(k, { boxSize: v })} />
          </Row>
        )}
      </>
    );
  };
  return (
    <>
      <div className="settings-section">Chart type parameters</div>
      {kind === "renko" && (
        <>
          {boxField("renko")}
          <Row label="Source">
            <select aria-label="Renko source" value={o.renko!.source ?? "close"} onChange={(e) => set("renko", { source: e.target.value as "close" | "hl" })}>
              <option value="close">Close</option>
              <option value="hl">High / low</option>
            </select>
          </Row>
        </>
      )}
      {kind === "pnf" && (
        <>
          {boxField("pnf")}
          <Row label="Reversal (boxes)">
            <NumberField value={o.pnf!.reversal} min={1} max={20} step={1} integer title="Reversal" onChange={(v) => set("pnf", { reversal: v })} />
          </Row>
        </>
      )}
      {kind === "kagi" && (
        <>
          <Row label="Reversal mode">
            <select aria-label="Kagi reversal mode" value={o.kagi!.mode} onChange={(e) => set("kagi", { mode: e.target.value as "absolute" | "percent" })}>
              <option value="percent">Percent</option>
              <option value="absolute">Price</option>
            </select>
          </Row>
          <Row label="Reversal amount">
            <NumberField value={o.kagi!.reversal} min={0} step={0.1} title="Reversal amount" onChange={(v) => v > 0 && set("kagi", { reversal: v })} />
          </Row>
        </>
      )}
      {kind === "linebreak" && (
        <Row label="Lines">
          <NumberField value={o.linebreak!.lines} min={1} max={10} step={1} integer title="Line count" onChange={(v) => set("linebreak", { lines: v })} />
        </Row>
      )}
      {kind === "range" && (
        <Row label="Range (price)">
          <NumberField value={o.range!.range} min={0} step={0.01} title="Range" onChange={(v) => v > 0 && set("range", { range: v })} />
        </Row>
      )}
    </>
  );
}
