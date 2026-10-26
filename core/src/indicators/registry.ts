// The list of built-in indicators shown in the indicator picker.

import type { IndicatorDef } from "../types";
import { MACD_DEF, RSI_DEF, STOCH_DEF } from "./oscillators";
import { DONCHIAN_DEF, EMA_DEF, SMA_DEF, WMA_DEF } from "./trend";
import { ATR_DEF, BB_DEF } from "./volatility";
import { OBV_DEF, VOLUME_DEF, VWAP_DEF } from "./volume";

export const INDICATORS: IndicatorDef[] = [
  SMA_DEF,
  EMA_DEF,
  WMA_DEF,
  BB_DEF,
  DONCHIAN_DEF,
  VWAP_DEF,
  RSI_DEF,
  MACD_DEF,
  STOCH_DEF,
  ATR_DEF,
  OBV_DEF,
  VOLUME_DEF,
];

const BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

export function getIndicator(id: string): IndicatorDef | undefined {
  return BY_ID.get(id);
}
