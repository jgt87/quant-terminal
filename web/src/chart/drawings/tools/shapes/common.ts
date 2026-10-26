// Fields and painting shared by the filled shapes (rotated rectangle, circle, ellipse,
// polyline, triangle, arc): Border width / color, Background on/off + color.

import type { Drawing } from "@qt/core";
import { catalogColor } from "../../builders";
import { drawText, fillColor, prop, textStyleOf } from "../../draw";
import type { DrawCtx, SettingsField } from "../../types";
import { F, withProps, withText } from "./kit";

/** Border + background fields (catalog linewidth, <colorKey>, fillBackground, backgroundColor). */
export function borderFields(o: { color: string; colorKey?: string; background: string; fill?: boolean }): SettingsField[] {
  const fill = o.fill ?? true;
  return [
    F.color("style.color", "Border", o.colorKey ?? "color", o.color),
    F.width("style.width", "Border width", "linewidth", 2),
    F.check("props.fillBackground", "Background", "fillBackground", fill),
    F.color("style.fillColor", "Background color", "backgroundColor", catalogColor(o.background), fill ? {} : { testWith: withProps({ fillBackground: true }) }),
  ];
}

/** Text tab of circle / ellipse (catalog textColor, fontSize, bold, italic, text). */
export function shapeTextFields(color: string): SettingsField[] {
  return [
    F.text("Text"),
    F.color("style.textColor", "Text color", "textColor", color, { testWith: withText }),
    F.font("style.textSize", "Font size", "fontSize", 14, { testWith: withText }),
    F.check("style.bold", "Bold", "bold", false, { testWith: withText }),
    F.check("style.italic", "Italic", "italic", false, { testWith: withText }),
  ];
}

/** Fills the current path when the background is on. */
export function fillIfOn(c: DrawCtx, d: Drawing, def = true): void {
  if (!prop(d, "fillBackground", def)) return;
  c.ctx.save();
  c.ctx.fillStyle = fillColor(d, c.color);
  c.ctx.fill();
  c.ctx.restore();
}

/** Text centered at (x, y) in the drawing's text style. */
export function centerText(c: DrawCtx, d: Drawing, x: number, y: number): void {
  if (!d.text) return;
  drawText(c, d.text, x, y, { ...textStyleOf(d, c, 14), align: "center", baseline: "middle" });
}
