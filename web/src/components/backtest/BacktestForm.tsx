// Strategy selection, strategy parameters, costs, sizing and risk inputs.

import type { StrategyDef } from "@qt/core";
import type { CostForm, SizingMode } from "../../backtest/config";
import { NumberField } from "../NumberField";

interface Props {
  strategies: StrategyDef[];
  strategy: StrategyDef;
  params: Record<string, number>;
  costs: CostForm;
  barsPerYear: number;
  onStrategy(id: string): void;
  onParam(key: string, v: number): void;
  onCosts(c: CostForm): void;
}

export function BacktestForm({ strategies, strategy, params, costs, barsPerYear, onStrategy, onParam, onCosts }: Props) {
  const set = <K extends keyof CostForm>(k: K, v: CostForm[K]) => onCosts({ ...costs, [k]: v });
  return (
    <div className="bt-form">
      <section>
        <h3>Strategy</h3>
        <label className="form-row">
          <span>Strategy</span>
          <select value={strategy.id} onChange={(e) => onStrategy(e.target.value)}>
            {strategies.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <p className="bt-desc">{strategy.description}</p>
        {strategy.params.map((p) => (
          <label key={p.key} className="form-row">
            <span>{p.label}</span>
            <NumberField
              value={params[p.key] ?? p.default}
              min={p.min}
              max={p.max}
              step={p.step ?? (p.type === "int" ? 1 : 0.1)}
              integer={p.type === "int"}
              onChange={(v) => onParam(p.key, v)}
            />
          </label>
        ))}
      </section>
      <section>
        <h3>Costs</h3>
        <label className="form-row">
          <span>Initial capital</span>
          <NumberField value={costs.initialCapital} min={1} step={1000} onChange={(v) => set("initialCapital", v)} />
        </label>
        <label className="form-row">
          <span>Commission (bps)</span>
          <NumberField value={costs.commissionBps} min={0} step={0.5} onChange={(v) => set("commissionBps", v)} />
        </label>
        <label className="form-row">
          <span>Fixed / order</span>
          <NumberField value={costs.commissionFixed} min={0} step={0.5} onChange={(v) => set("commissionFixed", v)} />
        </label>
        <label className="form-row">
          <span>Slippage (bps)</span>
          <NumberField value={costs.slippageBps} min={0} step={0.5} onChange={(v) => set("slippageBps", v)} />
        </label>
      </section>
      <section>
        <h3>Sizing &amp; risk</h3>
        <label className="form-row">
          <span>Sizing</span>
          <select value={costs.sizingMode} onChange={(e) => set("sizingMode", e.target.value as SizingMode)}>
            <option value="percent-equity">% of equity</option>
            <option value="fixed-qty">Fixed quantity</option>
            <option value="fixed-cash">Fixed cash</option>
          </select>
        </label>
        {costs.sizingMode === "percent-equity" && (
          <label className="form-row">
            <span>% equity</span>
            <NumberField value={costs.sizingPercent} min={1} max={100} step={5} onChange={(v) => set("sizingPercent", v)} />
          </label>
        )}
        {costs.sizingMode === "fixed-qty" && (
          <label className="form-row">
            <span>Quantity</span>
            <NumberField value={costs.sizingQty} min={0} step={1} onChange={(v) => set("sizingQty", v)} />
          </label>
        )}
        {costs.sizingMode === "fixed-cash" && (
          <label className="form-row">
            <span>Cash / trade</span>
            <NumberField value={costs.sizingCash} min={0} step={1000} onChange={(v) => set("sizingCash", v)} />
          </label>
        )}
        <label className="form-row">
          <span>Allow short</span>
          <input type="checkbox" checked={costs.allowShort} onChange={(e) => set("allowShort", e.target.checked)} />
        </label>
        <label className="form-row">
          <span>Stop loss %</span>
          <NumberField value={costs.stopLossPct} min={0} step={0.5} title="0 = off" onChange={(v) => set("stopLossPct", v)} />
        </label>
        <label className="form-row">
          <span>Take profit %</span>
          <NumberField value={costs.takeProfitPct} min={0} step={0.5} title="0 = off" onChange={(v) => set("takeProfitPct", v)} />
        </label>
        <div className="form-row static" title="Derived from interval and asset type">
          <span>Bars / year</span>
          <span className="num-static">{barsPerYear}</span>
        </div>
      </section>
    </div>
  );
}
