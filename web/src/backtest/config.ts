// Backtest form state <-> core BacktestConfig, and trade -> chart marker mapping. Pure.

import type { BacktestConfig, Trade } from "@qt/core";
import defaults from "../config/backtestDefaults.json";
import type { TradeMarker } from "../chart/renderers/overlays";

export type SizingMode = "percent-equity" | "fixed-qty" | "fixed-cash";

export interface CostForm {
  initialCapital: number;
  commissionBps: number;
  commissionFixed: number;
  slippageBps: number;
  sizingMode: SizingMode;
  sizingPercent: number;
  sizingQty: number;
  sizingCash: number;
  allowShort: boolean;
  stopLossPct: number;
  takeProfitPct: number;
  riskFreeRate: number;
}

export const DEFAULT_COSTS: CostForm = { ...defaults, sizingMode: defaults.sizingMode as SizingMode };

export function toConfig(f: CostForm, barsPerYear: number): BacktestConfig {
  const sizing: BacktestConfig["sizing"] =
    f.sizingMode === "fixed-qty"
      ? { mode: "fixed-qty", qty: f.sizingQty }
      : f.sizingMode === "fixed-cash"
        ? { mode: "fixed-cash", cash: f.sizingCash }
        : { mode: "percent-equity", percent: f.sizingPercent };
  return {
    initialCapital: f.initialCapital,
    commissionBps: f.commissionBps,
    commissionFixed: f.commissionFixed,
    slippageBps: f.slippageBps,
    sizing,
    allowShort: f.allowShort,
    stopLossPct: f.stopLossPct > 0 ? f.stopLossPct : undefined,
    takeProfitPct: f.takeProfitPct > 0 ? f.takeProfitPct : undefined,
    barsPerYear,
    riskFreeRate: f.riskFreeRate,
  };
}

export function tradeMarkers(trades: Trade[]): TradeMarker[] {
  const out: TradeMarker[] = [];
  for (const t of trades) {
    out.push({ time: t.entryTime, price: t.entryPrice, kind: t.side === "long" ? "entry-long" : "entry-short" });
    out.push({ time: t.exitTime, price: t.exitPrice, kind: t.side === "long" ? "exit-long" : "exit-short" });
  }
  return out;
}

/** Inclusive numeric range for parameter sweeps, capped to keep the grid small. */
export function rangeValues(from: number, to: number, step: number, max = 25): number[] {
  if (!(step > 0) || !isFinite(from) || !isFinite(to)) return [from];
  const out: number[] = [];
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  for (let v = lo; v <= hi + step * 1e-9 && out.length < max; v += step) out.push(Number(v.toPrecision(10)));
  return out;
}
