// User-script plots as chart items: overlay plots form one item on the price pane, separate plots
// one item in their own pane. They draw, scale and appear in the legend like indicators.

import type { IndicatorDef, ScriptRunResult, Series } from "@qt/core";
import type { ComputedIndicator } from "./IndicatorSet";

export const SCRIPT_UID_PREFIX = "script:";

export function isScriptUid(uid: string): boolean {
  return uid.startsWith(SCRIPT_UID_PREFIX);
}

type Plot = NonNullable<ScriptRunResult["plots"]>[number];

export function scriptIndicators(plots: Plot[], outputs: Record<string, Series>, ordinal: number): ComputedIndicator[] {
  const out: ComputedIndicator[] = [];
  for (const pane of ["overlay", "separate"] as const) {
    const list = plots.filter((p) => p.pane === pane && outputs[p.key]);
    if (!list.length) continue;
    const def: IndicatorDef = {
      id: `script-${pane}`,
      name: "Script",
      shortName: list.length === 1 ? list[0].title : `Script (${list.map((p) => p.title).join(", ")})`,
      pane,
      inputs: [],
      outputs: list.map((p) => ({ key: p.key, label: p.title, style: p.style })),
      compute: () => ({}),
    };
    const style = { outputs: Object.fromEntries(list.filter((p) => p.color).map((p) => [p.key, { color: p.color }])) };
    out.push({
      uid: `${SCRIPT_UID_PREFIX}${pane}`,
      def,
      inputs: {},
      visible: true,
      series: Object.fromEntries(list.map((p) => [p.key, outputs[p.key]])),
      ordinal: ordinal + out.length,
      style,
      pane,
      external: true,
    });
  }
  return out;
}
