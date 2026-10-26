// Whether a drawing is drawn (and hit-testable) on a chart interval: hidden flag, hide-all, and
// the per-interval visibility rules (core visibleAt).

import { intervalUnit, visibleAt, type Drawing } from "@qt/core";

export function drawingVisible(d: Drawing, intervalSec: number | null, hideAll = false): boolean {
  if (d.hidden || hideAll) return false;
  return intervalSec == null || visibleAt(d.visibility, intervalUnit(intervalSec));
}
