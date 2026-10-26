// Fixed range volume profile (between two anchor times) and anchored volume profile (from the
// anchor to the last bar). The profile itself comes from the engine (DrawCtx.profile).

import { hitTestBody, type Drawing } from "@qt/core";
import { crisp } from "../../../canvas";
import { drawVolumeProfile } from "../../../renderers/profile";
import { styleFields } from "../../builders";
import { anchorHandles, line } from "../../draw";
import type { DrawCtx, DrawingToolDef } from "../../types";

function renderProfile(c: DrawCtx, d: Drawing): void {
  const { ctx, height, dpr } = c;
  const r = c.profile?.(d);
  if (r && r.x1 > r.x0) {
    ctx.save();
    ctx.globalAlpha = 1;
    drawVolumeProfile(c, r.profile, r.x0, (r.x1 - r.x0) * 0.9, 1, [r.x0, r.x1]);
    ctx.restore();
  }
  // Range edges in the drawing color.
  for (const a of d.anchors.slice(0, d.type === "vprofile" ? 2 : 1)) {
    const x = crisp(c.toPx(a).x, dpr);
    ctx.save();
    // Dashed [4,3] edges unless the user picked a line style (already set on the context).
    if (!d.style?.lineStyle) ctx.setLineDash([4, 3]);
    line(ctx, { x, y: 0 }, { x, y: height });
    ctx.restore();
  }
}

export const vprofile: DrawingToolDef = {
  type: "vprofile",
  catalogType: "LineToolFixedRangeVolumeProfile",
  family: "projection",
  section: "Volume-based",
  label: "Fixed range volume profile",
  icon: "vprofile",
  anchors: 2,
  defaults: {},
  settings: { style: styleFields() },
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  render: renderProfile,
  handles: anchorHandles,
};

export const avprofile: DrawingToolDef = {
  type: "avprofile",
  catalogType: "LineToolAnchoredVolumeProfile",
  family: "projection",
  section: "Volume-based",
  label: "Anchored volume profile",
  icon: "avprofile",
  anchors: 1,
  defaults: {},
  settings: { style: styleFields() },
  hitTest: (d, g, x, y, tol) => hitTestBody(d, g.toPx, x, y, tol, g.viewport),
  render: renderProfile,
  handles: anchorHandles,
  bounds(d, g) {
    const p = g.toPx(d.anchors[0]);
    return { x: p.x, y: 0, width: 0, height: g.viewport.height };
  },
};
