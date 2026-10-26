// Script signals -> core StrategyDef, so strategy scripts run through the core backtester
// (a signal on bar i fills at bar i+1's open, like every strategy).

import { runBacktest, type BacktestConfig, type BacktestResult, type Bar, type Signal, type StrategyDef } from "@qt/core";
import type { ScriptSignal } from "./sandbox";

export function toCoreSignal(s: ScriptSignal): NonNullable<Signal> {
  if (s.action === "exit") return { action: "exit" };
  return { action: "enter", side: s.action === "enter-long" ? "long" : "short" };
}

/** Strategy that replays the given signals by bar index (the last signal on a bar wins). */
export function signalsToStrategy(signals: readonly ScriptSignal[], name = "User script"): StrategyDef {
  const byIndex = new Map<number, NonNullable<Signal>>();
  for (const s of signals) byIndex.set(s.index, toCoreSignal(s));
  return {
    id: "user-script",
    name,
    description: "Signals produced by a user script",
    params: [],
    init: () => ({}),
    onBar: (ctx) => byIndex.get(ctx.index) ?? null,
  };
}

export function backtestSignals(bars: Bar[], signals: readonly ScriptSignal[], config: BacktestConfig, name?: string): BacktestResult {
  return runBacktest(bars, signalsToStrategy(signals, name), {}, config);
}
