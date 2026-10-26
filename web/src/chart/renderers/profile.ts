// Volume profile histograms (up/down split, value-area shading, POC line) and TPO letters.

import type { VolumeProfile } from "@qt/core";
import { crisp, hairline, snap } from "../canvas";
import type { TpoSession } from "../studies/compute";
import { font } from "../theme";
import { profileRowRects } from "./profileGeometry";
import type { PaneRenderCtx } from "./types";

/**
 * Horizontal histogram of `p`. Rows grow from `x0` to the right (dir 1) or to the left (dir -1),
 * up to `maxWidth`; `spanX` is the horizontal extent the value area and POC line cover.
 */
export function drawVolumeProfile(rc: PaneRenderCtx, p: VolumeProfile, x0: number, maxWidth: number, dir: 1 | -1, spanX?: [number, number]): void {
  if (!p.rows.length || !isFinite(p.poc)) return;
  const { ctx, ps, dpr, theme } = rc;
  const rects = profileRowRects(p, (v) => ps.toY(v), maxWidth);
  const [sx0, sx1] = spanX ?? (dir === 1 ? [x0, x0 + maxWidth] : [x0 - maxWidth, x0]);
  // Value area band.
  const yTop = ps.toY(p.vah);
  const yBot = ps.toY(p.val);
  ctx.fillStyle = theme.profileValueArea;
  ctx.fillRect(Math.min(sx0, sx1), Math.min(yTop, yBot), Math.abs(sx1 - sx0), Math.abs(yBot - yTop));
  const gap = rects.length > 1 && rects[0].h > 3 ? 1 : 0;
  for (const r of rects) {
    if (r.w <= 0) continue;
    const y = snap(r.y, dpr);
    const h = Math.max(1 / dpr, snap(r.h - gap, dpr));
    // Up volume next to the anchor edge, down volume beyond it.
    ctx.fillStyle = r.inValueArea ? theme.profileValueUp : theme.profileUp;
    ctx.fillRect(dir === 1 ? x0 : x0 - r.upW, y, r.upW, h);
    ctx.fillStyle = r.inValueArea ? theme.profileValueDown : theme.profileDown;
    ctx.fillRect(dir === 1 ? x0 + r.upW : x0 - r.w, y, r.downW, h);
  }
  // POC line across the span.
  ctx.strokeStyle = theme.profilePoc;
  ctx.lineWidth = hairline(dpr, 2);
  ctx.beginPath();
  const yp = crisp(ps.toY(p.poc), dpr);
  ctx.moveTo(Math.min(sx0, sx1), yp);
  ctx.lineTo(Math.max(sx0, sx1), yp);
  ctx.stroke();
}

/** TPO letters per row from the session's first bar, POC row highlighted, initial balance bar. */
export function drawTpo(rc: PaneRenderCtx, s: TpoSession, x0: number, maxWidth: number): void {
  const { ctx, ps, dpr, theme } = rc;
  const p = s.profile;
  if (!p.rows.length || !isFinite(p.poc)) return;
  const rowH = Math.abs(ps.toY(0) - ps.toY(s.tick));
  const size = Math.max(6, Math.min(11, rowH * 0.95));
  const letters = rowH >= 5;
  const cw = size * 0.72;
  ctx.font = font(theme, size, 500);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const eps = s.tick * 1e-6;
  for (const row of p.rows) {
    if (!row.letters) continue;
    const y = ps.toY(row.price + s.tick / 2);
    const poc = Math.abs(row.price - p.poc) < eps;
    const inVa = row.price >= p.val - eps && row.price <= p.vah + eps;
    ctx.fillStyle = poc ? theme.tpoPoc : inVa ? theme.tpoValueText : theme.tpoText;
    const maxChars = Math.max(1, Math.floor(maxWidth / cw));
    if (letters) ctx.fillText(row.letters.slice(0, maxChars), x0, y);
    else ctx.fillRect(x0, snap(y - 0.5, dpr), Math.min(maxWidth, row.letters.length * 2), Math.max(1 / dpr, rowH - 0.5));
  }
  // Initial balance: a bar left of the letters.
  const ib = p.initialBalance;
  if (isFinite(ib.high) && isFinite(ib.low)) {
    ctx.strokeStyle = theme.tpoIb;
    ctx.lineWidth = hairline(dpr, 2);
    const x = crisp(x0 - 3, dpr);
    ctx.beginPath();
    ctx.moveTo(x, ps.toY(ib.high));
    ctx.lineTo(x, ps.toY(ib.low));
    ctx.stroke();
  }
}
