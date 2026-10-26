// Three-way merge for layout conflicts (another tab or device saved first).
// `base` is the last layout this tab knew from the server, `local` is this tab's current
// layout and `remote` is the newer stored layout. The user's latest local action survives:
// simple fields changed locally are re-applied on top of the remote layout, drawings merge per
// symbol, and anything structural changed on both sides (indicator list) adopts the remote.

import type { Layout } from "@qt/core";

const SIMPLE_KEYS = ["name", "symbol", "interval", "chartType", "logScale"] as const;
const OBJECT_KEYS = ["paneRatios", "chartSettings"] as const;

const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function mergeLayouts(base: Layout, local: Layout, remote: Layout): Layout {
  const out: Layout = { ...remote, drawings: { ...remote.drawings } };
  const rec = out as unknown as Record<string, unknown>;
  const loc = local as unknown as Record<string, unknown>;
  const bas = base as unknown as Record<string, unknown>;
  for (const k of [...SIMPLE_KEYS, ...OBJECT_KEYS]) {
    if (!same(loc[k], bas[k])) rec[k] = loc[k];
  }
  // Indicators: take the local list only when the remote did not change it too.
  if (!same(local.indicators, base.indicators) && same(remote.indicators, base.indicators)) out.indicators = local.indicators;
  // Drawings: per symbol, local edits win; symbols only the remote touched keep the remote.
  const syms = new Set([...Object.keys(local.drawings), ...Object.keys(base.drawings)]);
  for (const s of syms) {
    if (same(local.drawings[s], base.drawings[s])) continue;
    if (local.drawings[s] === undefined) delete out.drawings[s];
    else out.drawings[s] = local.drawings[s];
  }
  return out;
}

/** True when the merge result differs from the remote (i.e. local work must be saved again). */
export function differsFrom(a: Layout, b: Layout): boolean {
  const { updatedAt: _a, ...x } = a;
  const { updatedAt: _b, ...y } = b;
  return !same(x, y);
}
