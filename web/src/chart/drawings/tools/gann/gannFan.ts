// Gann fan (catalog LineToolGannFan): rays from the first anchor at Gann ratios 1/8 … 8/1 (price
// units per time unit), where the second anchor sets the 1/1 line. Each ray has its own color,
// width and style; the wedges between neighbouring rays are filled; labels at the ray ends.

import { GANN_FAN_RATIOS, distanceToRay, gannFanPoint, gannRatioLabel, type Drawing } from "@qt/core";
import { catalogColor, checkbox, colorField, levelTable, numberField } from "../../builders";
import { FAR, extend, prop, strokeWith } from "../../draw";
import type { DrawingToolDef, LevelRow, SettingsField } from "../../types";
import { alphaOf, everyRow, fill, label, rowColor, rowsAt } from "./common";

const COLORS = ["#FF9800", "#089981", "#4caf50", "#089981", "#00bcd4", "#2962FF", "#9c27b0", "#e91e63", "#F23645"];

/** Factory rays (catalog level1..level9): ratio = coeff1 / coeff2. */
export const fanRows = (): LevelRow[] =>
  GANN_FAN_RATIOS.map((ratio, i) => ({ ratio, color: catalogColor(COLORS[i]), visible: true, width: 2, lineStyle: "solid" }));
const ROWS = { path: "style.levels", factory: fanRows };

const withFill = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, fillBackground: true } });
const withLabels = (d: Drawing): Drawing => ({ ...d, props: { ...d.props, showLabels: true } });

const style: SettingsField[] = [
  levelTable(fanRows, { label: "Levels", valueLabel: "Price/time", catalogPrefix: "level", lineColumns: true }),
  { ...colorField("props.linesColors", "Use one color", undefined), default: null, catalog: "linesColors (derived)", testValue: "#e91e63" },
  { ...checkbox("props.fillBackground", "Background", true), catalog: "fillBackground" },
  { ...numberField("props.transparency", "Background opacity", 80, { min: 0, max: 100 }), catalog: "transparency", testWith: withFill, testValue: 30 },
  { ...checkbox("props.showLabels", "Labels", true), catalog: "showLabels", testWith: withLabels },
];

export const gannFan: DrawingToolDef = {
  type: "gannFan",
  catalogType: "LineToolGannFan",
  family: "gann",
  label: "Gann fan",
  icon: "gannFan",
  iconPath: "M5.5 22.5L22.5 5.5M5.5 22.5L22.5 13.5M5.5 22.5L22.5 19.5M5.5 22.5L13.5 5.5M5.5 22.5L8.5 4.5",
  iconFill: "M5.5 25a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM22.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  anchors: 2,
  defaults: { levels: fanRows() },
  defaultProps: { fillBackground: true, transparency: 80, showLabels: true },
  floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "settings", "lock", "remove", "more"],
  floatBindings: { "line-tool-color": everyRow([ROWS], "color"), "line-tool-width": everyRow([ROWS], "width") },
  settings: { coordinates: "time-price", style },
  hitTest(d, g, x, y, tol) {
    const [a, b] = d.anchors;
    if (!a || !b) return false;
    const pa = g.toPx(a);
    return rowsAt(d, ROWS.path, ROWS.factory).some((r) => {
      if (r.visible === false) return false;
      const q = g.toPx(gannFanPoint(a, b, r.ratio));
      return distanceToRay(x, y, pa.x, pa.y, q.x, q.y) <= tol;
    });
  },
  render(c, d) {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const { ctx } = c;
    const pa = c.toPx(a);
    const rays = rowsAt(d, ROWS.path, ROWS.factory)
      .filter((r) => r.visible !== false)
      .sort((m, n) => m.ratio - n.ratio)
      .map((r) => ({ r, q: c.toPx(gannFanPoint(a, b, r.ratio)) }))
      .filter((x) => x.q.x !== pa.x || x.q.y !== pa.y);
    if (prop(d, "fillBackground", true)) {
      const alpha = alphaOf(d.props?.transparency, 80);
      for (let k = 1; k < rays.length; k++) {
        const e0 = extend(pa, rays[k - 1].q, FAR);
        const e1 = extend(pa, rays[k].q, FAR);
        ctx.fillStyle = fill(rowColor(d, rays[k].r, c.color), alpha);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(e0.x, e0.y);
        ctx.lineTo(e1.x, e1.y);
        ctx.closePath();
        ctx.fill();
      }
    }
    for (const { r, q } of rays) {
      const color = rowColor(d, r, c.color);
      strokeWith(ctx, color, r.width ?? 1, r.lineStyle ?? "solid");
      const e = extend(pa, q, FAR);
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      if (prop(d, "showLabels", true)) label(c, gannRatioLabel(r.ratio), q.x + 4, q.y, color, "left", "middle");
    }
  },
  handles: (d, g) => d.anchors.map((a) => g.toPx(a)),
};
