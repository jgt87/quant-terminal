// Shared pieces of the cycle tools: catalog line fields (width · style · color) and the stroke
// set-up from the drawing's style.

import type { Drawing } from "@qt/core";
import { strokeWith } from "../../draw";
import type { DrawCtx, SettingsField } from "../../types";

/** Width / style / color rows in catalog order with the catalog's group label ("Lines" / "Line"). */
export function lineFields(group: string, color: string): SettingsField[] {
  return [
    { kind: "width", key: "style.width", label: `${group} / width`, catalog: "linewidth", default: 2 },
    { kind: "lineStyle", key: "style.lineStyle", label: `${group} / style`, catalog: "linestyle", default: "solid" },
    { kind: "color", key: "style.color", label: `${group} / color`, catalog: "linecolor", default: color },
  ];
}

/** Applies the drawing's line color, width (+0.5 when selected/hovered) and style. */
export function applyStroke(c: DrawCtx, d: Drawing): void {
  const w = (d.style?.width ?? 2) + (c.selected || c.hovered ? 0.5 : 0);
  strokeWith(c.ctx, c.color, w, d.style?.lineStyle ?? "solid");
}

