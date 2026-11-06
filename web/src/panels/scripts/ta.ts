// The `ta` helper object user scripts receive: core indicator math over plain number arrays.

import type { Bar, Series } from "@qt/core";
import {
  atr as coreAtr,
  bollinger,
  cci,
  dmi,
  ema,
  hma,
  highest,
  keltner,
  lowest,
  macd,
  mfi,
  psar,
  rma,
  roc,
  rsi,
  sma,
  stdev,
  supertrend,
  williamsR,
  wma,
} from "@qt/core/src/indicators";

type Src = ReadonlyArray<number | null>;
type Operand = Src | number;

const at = (x: Operand, i: number): number | null => (typeof x === "number" ? x : (x[i] ?? null));

/** true on bars where `a` moves from <= b to > b (crossunder mirrored); false otherwise. */
function cross(a: Operand, b: Operand, up: boolean, len: number): boolean[] {
  const out = new Array<boolean>(len).fill(false);
  for (let i = 1; i < len; i++) {
    const a0 = at(a, i - 1);
    const b0 = at(b, i - 1);
    const a1 = at(a, i);
    const b1 = at(b, i);
    if (a0 === null || b0 === null || a1 === null || b1 === null) continue;
    out[i] = up ? a0 <= b0 && a1 > b1 : a0 >= b0 && a1 < b1;
  }
  return out;
}

const lenOf = (...xs: Operand[]) => Math.max(0, ...xs.map((x) => (typeof x === "number" ? 0 : x.length)));

export function makeTa(bars: readonly Bar[]) {
  const list = bars as Bar[];
  return Object.freeze({
    sma: (src: Src, n: number): Series => sma(src, n),
    ema: (src: Src, n: number): Series => ema(src, n),
    wma: (src: Src, n: number): Series => wma(src, n),
    rma: (src: Src, n: number): Series => rma(src, n),
    hma: (src: Src, n: number): Series => hma(src, n),
    roc: (src: Src, n = 9): Series => roc(src, n),
    cci: (src: Src, n = 20): Series => cci(src, n),
    rsi: (src: Src, n = 14): Series => rsi(src, n),
    macd: (src: Src, fast = 12, slow = 26, signal = 9) => macd(src, fast, slow, signal),
    bollinger: (src: Src, n = 20, mult = 2) => bollinger(src, n, mult),
    /** ta.atr(14) on the script's bars, or ta.atr(otherBars, 14). */
    atr: (a: number | readonly Bar[], b?: number): Series => (typeof a === "number" ? coreAtr(list, a) : coreAtr(a as Bar[], b ?? 14)),
    /** { plus, minus, adx } on the script's bars. */
    dmi: (n = 14, adxLen = 14) => dmi(list, n, adxLen),
    williamsR: (n = 14): Series => williamsR(list, n),
    mfi: (n = 14): Series => mfi(list, n),
    psar: (start = 0.02, step = 0.02, max = 0.2): Series => psar(list, start, step, max),
    /** { up, down, trend } on the script's bars; trend is 1 or −1. */
    supertrend: (n = 10, factor = 3) => supertrend(list, n, factor),
    keltner: (src: Src, n = 20, mult = 2, atrLen = 10) => keltner(list, src, n, mult, atrLen),
    highest: (src: Src, n: number): Series => highest(src, n),
    lowest: (src: Src, n: number): Series => lowest(src, n),
    stdev: (src: Src, n: number): Series => stdev(src, n),
    crossover: (a: Operand, b: Operand): boolean[] => cross(a, b, true, lenOf(a, b)),
    crossunder: (a: Operand, b: Operand): boolean[] => cross(a, b, false, lenOf(a, b)),
  });
}

export type Ta = ReturnType<typeof makeTa>;
