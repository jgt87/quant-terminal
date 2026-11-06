// The list of built-in indicators shown in the indicator picker (moving averages, trend, bands,
// momentum, volatility, volume).

import type { IndicatorDef } from "../types";
import { BB_PERCENT_B_DEF, BB_WIDTH_DEF, CHANDELIER_DEF, CHOP_DEF, ENVELOPE_DEF, HV_DEF, KELTNER_DEF } from "./bands";
import { ADX_DEF, AROON_DEF, AROON_OSC_DEF, DMI_DEF, ICHIMOKU_DEF, PSAR_DEF, SUPERTREND_DEF, VORTEX_DEF } from "./directional";
import {
  AWESOME_DEF,
  CCI_DEF,
  CMO_DEF,
  COPPOCK_DEF,
  DPO_DEF,
  MOMENTUM_DEF,
  ROC_DEF,
  STOCH_RSI_DEF,
  TRIX_DEF,
  TSI_DEF,
  ULTIMATE_DEF,
  WILLIAMS_R_DEF,
} from "./momentum";
import { ALMA_DEF, DEMA_DEF, HMA_DEF, KAMA_DEF, LSMA_DEF, SMMA_DEF, TEMA_DEF, VWMA_DEF } from "./movingAverages";
import { MACD_DEF, RSI_DEF, STOCH_DEF } from "./oscillators";
import { DONCHIAN_DEF, EMA_DEF, SMA_DEF, WMA_DEF } from "./trend";
import { ATR_DEF, BB_DEF } from "./volatility";
import { OBV_DEF, VOLUME_DEF, VWAP_DEF } from "./volume";
import { ADL_DEF, CHAIKIN_OSC_DEF, CMF_DEF, EOM_DEF, FORCE_INDEX_DEF, MFI_DEF, PVT_DEF } from "./volumeFlow";

export const INDICATORS: IndicatorDef[] = [
  // Moving averages
  SMA_DEF,
  EMA_DEF,
  WMA_DEF,
  DEMA_DEF,
  TEMA_DEF,
  HMA_DEF,
  ALMA_DEF,
  KAMA_DEF,
  LSMA_DEF,
  SMMA_DEF,
  VWMA_DEF,
  // Trend overlays and bands
  BB_DEF,
  KELTNER_DEF,
  DONCHIAN_DEF,
  ENVELOPE_DEF,
  ICHIMOKU_DEF,
  SUPERTREND_DEF,
  PSAR_DEF,
  CHANDELIER_DEF,
  VWAP_DEF,
  // Momentum
  RSI_DEF,
  MACD_DEF,
  STOCH_DEF,
  STOCH_RSI_DEF,
  CCI_DEF,
  WILLIAMS_R_DEF,
  ROC_DEF,
  MOMENTUM_DEF,
  AWESOME_DEF,
  TRIX_DEF,
  ULTIMATE_DEF,
  CMO_DEF,
  DPO_DEF,
  TSI_DEF,
  COPPOCK_DEF,
  // Trend strength
  DMI_DEF,
  ADX_DEF,
  AROON_DEF,
  AROON_OSC_DEF,
  VORTEX_DEF,
  CHOP_DEF,
  // Volatility
  ATR_DEF,
  HV_DEF,
  BB_PERCENT_B_DEF,
  BB_WIDTH_DEF,
  // Volume
  VOLUME_DEF,
  OBV_DEF,
  MFI_DEF,
  CMF_DEF,
  ADL_DEF,
  CHAIKIN_OSC_DEF,
  FORCE_INDEX_DEF,
  EOM_DEF,
  PVT_DEF,
];

const BY_ID = new Map(INDICATORS.map((d) => [d.id, d]));

export function getIndicator(id: string): IndicatorDef | undefined {
  return BY_ID.get(id);
}
