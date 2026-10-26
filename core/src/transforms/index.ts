// Price-only chart transforms (Bar[] → TransformedBar[]) and custom intervals.

import type { Bar } from "../types";
import type { TransformKind, TransformOptions, TransformedBar } from "../types-ext";
import { kagi } from "./kagi";
import { lineBreak } from "./linebreak";
import { pointAndFigure } from "./pnf";
import { rangeBars } from "./range";
import { renko } from "./renko";

export { renko, type RenkoOptions } from "./renko";
export { kagi, type KagiOptions } from "./kagi";
export { lineBreak, type LineBreakOptions } from "./linebreak";
export { pointAndFigure, type PnfOptions } from "./pnf";
export { rangeBars, type RangeBarOptions } from "./range";
export { resampleBars, MONDAY_ANCHOR, WEEK_SECONDS } from "./resample";
export { heikinAshi } from "./heikinAshi";

/** Defaults used by transformBars when an option block is missing. */
export const TRANSFORM_DEFAULTS: Required<TransformOptions> = {
  renko: { boxSize: "atr", atrLength: 14, source: "close" },
  kagi: { reversal: 4, mode: "percent" },
  linebreak: { lines: 3 },
  pnf: { boxSize: "atr", reversal: 3, atrLength: 14 },
  range: { range: 1 },
};

/** Dispatches to the transform named by `kind`. */
export function transformBars(bars: Bar[], kind: TransformKind, opts: TransformOptions = {}): TransformedBar[] {
  switch (kind) {
    case "renko":
      return renko(bars, opts.renko ?? TRANSFORM_DEFAULTS.renko);
    case "kagi":
      return kagi(bars, opts.kagi ?? TRANSFORM_DEFAULTS.kagi);
    case "linebreak":
      return lineBreak(bars, opts.linebreak ?? TRANSFORM_DEFAULTS.linebreak);
    case "pnf":
      return pointAndFigure(bars, opts.pnf ?? TRANSFORM_DEFAULTS.pnf);
    case "range":
      return rangeBars(bars, opts.range ?? TRANSFORM_DEFAULTS.range);
  }
}
