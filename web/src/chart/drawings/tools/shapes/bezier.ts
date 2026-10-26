// Shared definition of Curve (quadratic Bézier, catalog LineToolBezierQuadro) and Double curve
// (cubic, LineToolBezierCubic). Two clicks place the ends; the control points start as a bulge
// (curve) or an S (double curve) and become anchors 3 (and 4) once their handles are dragged.

import { shapeBezierPoints, shapeDefaultControls, shapeEndTangent, shapeHitBezier, shapeDistanceToPolyline, distanceToRay, type Drawing, type Point } from "@qt/core";
import { catalogColor } from "../../builders";
import { FAR, line, prop } from "../../draw";
import type { DrawingToolDef, ToolGeom } from "../../types";
import { fillIfOn } from "./common";
import { applyStroke, F, LINE_END, lineEnds, tracePath, withProps } from "./kit";

/** End points and control points of a curve in px (controls derived when not stored yet). */
export function curvePoints(d: Drawing, toPx: ToolGeom["toPx"], cubic: boolean): { p0: Point; p1: Point; controls: Point[] } | null {
  const [a, b] = d.anchors;
  if (!a || !b) return null;
  const p0 = toPx(a);
  const p1 = toPx(b);
  const derived = shapeDefaultControls(p0, p1, cubic);
  const controls = derived.map((q, i) => (d.anchors[2 + i] ? toPx(d.anchors[2 + i]) : q));
  return { p0, p1, controls };
}

/** Extension rays past the start (backwards along the start tangent) / end. */
function extensions(d: Drawing, p0: Point, p1: Point, controls: Point[]): [Point, Point][] {
  const out: [Point, Point][] = [];
  if (prop(d, "extendLeft", false)) {
    const t = shapeEndTangent(controls[0], p0);
    out.push([p0, { x: p0.x + t.x * FAR, y: p0.y + t.y * FAR }]);
  }
  if (prop(d, "extendRight", false)) {
    const t = shapeEndTangent(controls[controls.length - 1], p1);
    out.push([p1, { x: p1.x + t.x * FAR, y: p1.y + t.y * FAR }]);
  }
  return out;
}

export function makeCurveTool(o: { cubic: boolean; type: string; catalogType: string; label: string; color: string; background: string; iconPath: string; iconFill: string }): DrawingToolDef {
  const { cubic } = o;
  const fillHex = catalogColor(o.background);
  return {
    type: o.type,
    catalogType: o.catalogType,
    family: "shapes",
    label: o.label,
    icon: o.type,
    iconPath: o.iconPath,
    iconFill: o.iconFill,
    anchors: 2,
    defaults: { width: 2, lineStyle: "solid", color: o.color, fillColor: fillHex },
    defaultProps: { extendLeft: false, leftEnd: 0, extendRight: false, rightEnd: 0, fillBackground: false },
    floatingToolbar: ["templates", "line-tool-color", "line-tool-width", "style", "settings", "lock", "remove", "more"],
    settings: {
      coordinates: "time-price",
      style: [
        F.color("style.color", "Line", "linecolor", o.color),
        F.width("style.width", "Width", "linewidth", 2),
        F.lineStyle("style.lineStyle", "Line style", "linestyle", "solid"),
        F.check("props.extendLeft", "Extend left line", "extendLeft", false),
        F.select("props.leftEnd", "Left end", "leftEnd", LINE_END, 0),
        F.check("props.extendRight", "Extend right line", "extendRight", false),
        F.select("props.rightEnd", "Right end", "rightEnd", LINE_END, 0),
        F.check("props.fillBackground", "Background", "fillBackground", false),
        F.color("style.fillColor", "Background color", "backgroundColor", fillHex, { testWith: withProps({ fillBackground: true }) }),
      ],
    },
    hitTest(d, g, x, y, tol) {
      const c = curvePoints(d, g.toPx, cubic);
      if (!c) return false;
      if (shapeHitBezier(x, y, c.p0, c.controls, c.p1, tol, prop(d, "fillBackground", false))) return true;
      return extensions(d, c.p0, c.p1, c.controls).some(([s, e]) => distanceToRay(x, y, s.x, s.y, e.x, e.y) <= tol);
    },
    render(c, d) {
      const cp = curvePoints(d, c.toPx, cubic);
      if (!cp) return;
      const { ctx } = c;
      applyStroke(c, d);
      const pts = shapeBezierPoints(cp.p0, cp.controls, cp.p1, 64);
      if (prop(d, "fillBackground", false)) {
        tracePath(ctx, pts, true);
        fillIfOn(c, d, false);
      }
      ctx.beginPath();
      ctx.moveTo(cp.p0.x, cp.p0.y);
      if (cubic) ctx.bezierCurveTo(cp.controls[0].x, cp.controls[0].y, cp.controls[1].x, cp.controls[1].y, cp.p1.x, cp.p1.y);
      else ctx.quadraticCurveTo(cp.controls[0].x, cp.controls[0].y, cp.p1.x, cp.p1.y);
      ctx.stroke();
      for (const [s, e] of extensions(d, cp.p0, cp.p1, cp.controls)) line(ctx, s, e);
      lineEnds(c, d, pts);
      // Guide lines to the control points while selected.
      if (c.selected) {
        ctx.save();
        ctx.globalAlpha *= 0.5;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        line(ctx, cp.p0, cp.controls[0]);
        line(ctx, cp.p1, cp.controls[cp.controls.length - 1]);
        ctx.restore();
      }
    },
    handles(d, g) {
      const cp = curvePoints(d, g.toPx, cubic);
      if (!cp) return d.anchors.map((a) => g.toPx(a));
      return [cp.p0, cp.p1, ...cp.controls];
    },
    onAnchorDrag(d, index, a, g) {
      const cp = curvePoints(d, g.toPx, cubic);
      const anchors = [...d.anchors];
      // Store the derived controls first so the untouched ones keep their place.
      if (cp && index >= 2) cp.controls.forEach((q, i) => (anchors[2 + i] ??= g.toData(q)));
      anchors[index] = a;
      return { ...d, anchors };
    },
    bounds(d, g) {
      const cp = curvePoints(d, g.toPx, cubic);
      if (!cp) return { x: 0, y: 0, width: 0, height: 0 };
      const pts = shapeBezierPoints(cp.p0, cp.controls, cp.p1, 24);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
    },
  };
}

/** Distance helper for tests and stats: px distance from a point to the drawn curve. */
export function curveDistance(d: Drawing, g: Pick<ToolGeom, "toPx">, cubic: boolean, x: number, y: number): number {
  const cp = curvePoints(d, g.toPx, cubic);
  if (!cp) return Infinity;
  return shapeDistanceToPolyline(x, y, shapeBezierPoints(cp.p0, cp.controls, cp.p1, 64));
}
