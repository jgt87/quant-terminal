// Trend overlays: SMA, EMA, WMA, Donchian Channels.

import type { Bar, IndicatorDef, Series } from "../types";
import { ema, highest, lowest, sma, wma, type Values } from "./ma";
import { SOURCE_INPUT, intInput, lengthInput, sourceInput, sourceValues } from "./source";

/** Donchian Channels: upper = highest high(n), lower = lowest low(n), basis = midpoint. */
export function donchian(bars: Bar[], n: number): { upper: Series; lower: Series; basis: Series } {
  const upper = highest(bars.map((b) => b.high), n);
  const lower = lowest(bars.map((b) => b.low), n);
  const basis: Series = upper.map((u, i) => (u === null || lower[i] === null ? null : (u + (lower[i] as number)) / 2));
  return { upper, lower, basis };
}

function movingAverageDef(
  id: string,
  name: string,
  shortName: string,
  defLength: number,
  fn: (values: Values, n: number) => Series,
): IndicatorDef {
  const len = lengthInput("length", "Length", defLength);
  return {
    id,
    name,
    shortName,
    pane: "overlay",
    inputs: [len, SOURCE_INPUT],
    outputs: [{ key: id, label: shortName, style: "line" }],
    compute(bars, inputs) {
      return { [id]: fn(sourceValues(bars, sourceInput(inputs, SOURCE_INPUT)), intInput(inputs, len)) };
    },
  };
}

export const SMA_DEF = movingAverageDef("sma", "Simple Moving Average", "SMA", 20, sma);
export const EMA_DEF = movingAverageDef("ema", "Exponential Moving Average", "EMA", 20, ema);
export const WMA_DEF = movingAverageDef("wma", "Weighted Moving Average", "WMA", 20, wma);

const DC_LEN = lengthInput("length", "Length", 20);
export const DONCHIAN_DEF: IndicatorDef = {
  id: "donchian",
  name: "Donchian Channels",
  shortName: "DC",
  pane: "overlay",
  inputs: [DC_LEN],
  outputs: [
    { key: "upper", label: "Upper", style: "band-upper" },
    { key: "basis", label: "Basis", style: "line" },
    { key: "lower", label: "Lower", style: "band-lower" },
  ],
  compute(bars, inputs) {
    return donchian(bars, intInput(inputs, DC_LEN));
  },
};
