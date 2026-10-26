// Per-study result cache: recomputed only when the chart bars or the study inputs change.

import type { Bar } from "@qt/core";
import type { ComputedIndicator } from "../IndicatorSet";
import { computeStudy, type StudyResult } from "./compute";
import { isStudy } from "./defs";

export class StudyCache {
  private items = new Map<string, { key: string; result: StudyResult }>();
  private version = 0;

  /** The chart bars changed (new data, live update, replay step, transform). */
  invalidate(): void {
    this.version++;
  }

  get(c: ComputedIndicator, bars: Bar[], intervalSec: number): StudyResult {
    if (!isStudy(c.def)) return {};
    const key = `${this.version}|${intervalSec}|${JSON.stringify(c.inputs)}`;
    const hit = this.items.get(c.uid);
    if (hit && hit.key === key) return hit.result;
    let result: StudyResult;
    try {
      result = computeStudy(c.def.study, bars, c.inputs, intervalSec);
    } catch (e) {
      result = { error: e instanceof Error ? e.message : String(e) };
    }
    this.items.set(c.uid, { key, result });
    return result;
  }

  /** Drop results of studies that are gone. */
  retain(uids: Set<string>): void {
    for (const k of this.items.keys()) if (!uids.has(k)) this.items.delete(k);
  }
}
