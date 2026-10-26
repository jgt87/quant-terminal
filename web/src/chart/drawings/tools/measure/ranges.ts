// Measurers (catalog LineToolPriceRange, LineToolDateRange, LineToolDateAndPriceRange): a shaded
// range between two anchors with arrows and a label of the range statistics (price change,
// percent, ticks, bars, time span, volume of the bars in range) plus an optional custom text.

import { forecastInBox, rangeSpanText, rangeStats, tickSizeFor, type Anchor, type Drawing, type Point } from "@qt/core";
import { formatSigned } from "../../../format";
import { catalogColor } from "../../builders";
import { anchorHandles, arrowHead, drawText, FAR, line, prop, strokeWith } from "../../draw";
import type { DrawCtx, DrawingToolDef, SettingsField, ToolGeom } from "../../types";
import { CATALOG_FONT_SIZES, fmtVolume, labelBox, withTransparency } from "../projection/common";

type Kind = "price" | "date" | "dateAndPrice";

const BLUE = "#2962ff";
const BG = catalogColor("rgba(41, 98, 255, 0.15)");

type StatKey = "showPriceRange" | "showPercentPriceRange" | "showPipsPriceRange" | "showBarsRange" | "showDateTimeRange" | "showVolume";
const STAT_LABELS: Record<StatKey, string> = {
  showPriceRange: "Price range",
  showPercentPriceRange: "Percent change",
  showPipsPriceRange: "Change in pips",
  showBarsRange: "Bars range",
  showDateTimeRange: "Date/time range",
  showVolume: "Volume",
};
const STATS: Record<Kind, StatKey[]> = {
  price: ["showPriceRange", "showPercentPriceRange", "showPipsPriceRange"],
  date: ["showBarsRange", "showDateTimeRange", "showVolume"],
  dateAndPrice: ["showPriceRange", "showPercentPriceRange", "showPipsPriceRange", "showBarsRange", "showDateTimeRange", "showVolume"],
};

/** Label lines of a range drawing (only the enabled stats). */
export function rangeLines(d: Drawing, g: Pick<ToolGeom, "bars" | "intervalSec">, kind: Kind, decimals: number): string[] {
  const [a, b] = d.anchors;
  if (!a || !b) return [];
  const st = rangeStats(a, b, g.bars, g.intervalSec, tickSizeFor(a.price));
  const on = (k: StatKey) => STATS[kind].includes(k) && prop(d, k, true) !== false;
  const out: string[] = [];
  const price = [
    on("showPriceRange") ? formatSigned(st.priceChange, decimals) : "",
    on("showPercentPriceRange") ? `(${formatSigned(st.percent, 2)}%)` : "",
    on("showPipsPriceRange") ? `${st.ticks}` : "",
  ].filter(Boolean);
  if (price.length) out.push(price.join(" "));
  const time = [on("showBarsRange") ? `${st.bars} bars` : "", on("showDateTimeRange") ? `${st.seconds < 0 ? "−" : ""}${rangeSpanText(st.seconds)}` : ""].filter(Boolean);
  if (time.length) out.push(time.join(", "));
  if (on("showVolume")) out.push(`Vol ${fmtVolume(st.volume)}`);
  return out;
}

function arrow(c: DrawCtx, from: Point, to: Point): void {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 2) return;
  line(c.ctx, from, to);
  arrowHead(c.ctx, from, to, 7);
}

function render(kind: Kind) {
  return (c: DrawCtx, d: Drawing): void => {
    const [a, b] = d.anchors;
    if (!a || !b) return;
    const { ctx } = c;
    const p = c.toPx(a);
    const q = c.toPx(b);
    const l = Math.min(p.x, q.x);
    const r = Math.max(p.x, q.x);
    const t = Math.min(p.y, q.y);
    const btm = Math.max(p.y, q.y);
    const extL = kind === "price" && prop(d, "extendLeft", false);
    const extR = kind === "price" && prop(d, "extendRight", false);
    const extT = kind === "date" && prop(d, "extendTop", false);
    const extB = kind === "date" && prop(d, "extendBottom", false);
    const x0 = extL ? -FAR : l;
    const x1 = extR ? FAR : r;
    const y0 = extT ? -FAR : t;
    const y1 = extB ? FAR : btm;
    if (prop(d, "fillBackground", true)) {
      ctx.save();
      ctx.fillStyle = d.style?.fillColor ?? BG;
      if (kind === "price") ctx.fillRect(x0, t, x1 - x0, btm - t);
      else if (kind === "date") ctx.fillRect(l, y0, r - l, y1 - y0);
      else ctx.fillRect(l, t, r - l, btm - t);
      ctx.restore();
    }
    if (kind === "dateAndPrice" && prop(d, "drawBorder", false)) {
      ctx.save();
      strokeWith(ctx, String(prop(d, "borderColor", BLUE)), Number(prop(d, "borderWidth", 1)), "solid");
      ctx.strokeRect(l, t, r - l, btm - t);
      ctx.restore();
    }
    if (kind === "price") {
      line(ctx, { x: x0, y: p.y }, { x: x1, y: p.y });
      line(ctx, { x: x0, y: q.y }, { x: x1, y: q.y });
      arrow(c, { x: (l + r) / 2, y: p.y }, { x: (l + r) / 2, y: q.y });
    } else if (kind === "date") {
      line(ctx, { x: p.x, y: y0 }, { x: p.x, y: y1 });
      line(ctx, { x: q.x, y: y0 }, { x: q.x, y: y1 });
      arrow(c, { x: p.x, y: (t + btm) / 2 }, { x: q.x, y: (t + btm) / 2 });
    } else {
      arrow(c, { x: (l + r) / 2, y: p.y }, { x: (l + r) / 2, y: q.y });
      arrow(c, { x: p.x, y: (t + btm) / 2 }, { x: q.x, y: (t + btm) / 2 });
    }
    // Stats label: below the range when drawn downwards, else above.
    const size = Number(d.style?.textSize ?? 12);
    const down = q.y >= p.y;
    const lines = rangeLines(d, c, kind, c.priceDecimals);
    const bg = prop(d, "fillLabelBackground", true) ? withTransparency(String(prop(d, "labelBackgroundColor", "#2e2e2e")), Number(prop(d, "backgroundTransparency", 60))) : undefined;
    const box = labelBox(c, lines, (l + r) / 2, down ? btm + 8 : t - 8, { color: d.style?.textColor ?? "#ffffff", size, background: bg, baseline: down ? "top" : "bottom" });
    // Custom text above / below the stats label.
    const text = d.text?.trim();
    if (text) {
      const ty = box ? (down ? box.y + box.height + 8 : box.y - 8) : down ? btm + 8 : t - 8;
      drawText(c, text, (l + r) / 2, ty, {
        color: String(prop(d, "customText_color", BLUE)),
        size: Number(prop(d, "customText_fontsize", 12)),
        bold: prop(d, "customText_bold", false),
        italic: prop(d, "customText_italic", false),
        align: "center",
        baseline: down ? "top" : "bottom",
      });
    }
  };
}

function styleFields(kind: Kind): SettingsField[] {
  const f: SettingsField[] = [
    { kind: "width", key: "style.width", label: "Line width", catalog: "linewidth", default: 2 },
    { kind: "color", key: "style.color", label: "Line", catalog: "linecolor", default: BLUE },
  ];
  if (kind === "dateAndPrice") {
    f.push(
      { kind: "checkbox", key: "props.drawBorder", label: "Border", catalog: "drawBorder", default: false },
      { kind: "width", key: "props.borderWidth", label: "Border width", catalog: "borderWidth", default: 1, testWith: (d) => ({ ...d, props: { ...d.props, drawBorder: true } }) },
      { kind: "color", key: "props.borderColor", label: "Border color", catalog: "borderColor", default: BLUE, testWith: (d) => ({ ...d, props: { ...d.props, drawBorder: true } }) },
    );
  }
  f.push(
    { kind: "checkbox", key: "props.fillBackground", label: "Background", catalog: "fillBackground", default: true },
    { kind: "color", key: "style.fillColor", label: "Background color", catalog: "backgroundColor", default: BG, alpha: true },
  );
  if (kind === "price") {
    f.push(
      { kind: "checkbox", key: "props.extendLeft", label: "Extend left", catalog: "extendLeft", default: false },
      { kind: "checkbox", key: "props.extendRight", label: "Extend right", catalog: "extendRight", default: false },
    );
  }
  if (kind === "date") {
    f.push(
      { kind: "checkbox", key: "props.extendTop", label: "Extend top", catalog: "extendTop", default: false },
      { kind: "checkbox", key: "props.extendBottom", label: "Extend bottom", catalog: "extendBottom", default: false },
    );
  }
  f.push({ kind: "section", label: "Stats" });
  for (const k of STATS[kind]) f.push({ kind: "checkbox", key: `props.${k}`, label: STAT_LABELS[k], catalog: k, default: true });
  f.push(
    { kind: "section", label: "Info" },
    { kind: "color", key: "style.textColor", label: "Label", catalog: "textcolor", default: "#ffffff" },
    { kind: "fontSize", key: "style.textSize", label: "Label font size", catalog: "fontsize", default: 12, sizes: CATALOG_FONT_SIZES },
    { kind: "checkbox", key: "props.fillLabelBackground", label: "Label background", catalog: "fillLabelBackground", default: true },
    { kind: "color", key: "props.labelBackgroundColor", label: "Label background color", catalog: "labelBackgroundColor", default: "#2e2e2e", alpha: true },
  );
  return f;
}

const withText = (d: Drawing): Drawing => ({ ...d, text: d.text || "Note" });

const TEXT: SettingsField[] = [
  { kind: "color", key: "props.customText_color", label: "Text color", catalog: "customText.color", default: BLUE, testWith: withText },
  { kind: "fontSize", key: "props.customText_fontsize", label: "Font size", catalog: "customText.fontsize", default: 12, sizes: CATALOG_FONT_SIZES, testWith: withText },
  { kind: "checkbox", key: "props.customText_bold", label: "Bold", catalog: "customText.bold", default: false, testWith: withText },
  { kind: "checkbox", key: "props.customText_italic", label: "Italic", catalog: "customText.italic", default: false, testWith: withText },
  { kind: "text", key: "text", label: "Text", catalog: "customText.text (derived)", multiline: true, maxLength: 2000, default: "" },
];

const META: Record<Kind, { type: string; catalogType: string; label: string; iconPath: string }> = {
  price: {
    type: "priceRange",
    catalogType: "LineToolPriceRange",
    label: "Price range",
    // Two price levels with a vertical double arrow.
    iconPath: "M4.5 5.5h19M4.5 22.5h19M14.5 8.5v11M11.5 11.5l3-3 3 3M11.5 16.5l3 3 3-3",
  },
  date: {
    type: "dateRange",
    catalogType: "LineToolDateRange",
    label: "Date range",
    // Two time edges with a horizontal double arrow.
    iconPath: "M5.5 4.5v19M22.5 4.5v19M8.5 14.5h11M11.5 11.5l-3 3 3 3M16.5 11.5l3 3-3 3",
  },
  dateAndPrice: {
    type: "dateAndPriceRange",
    catalogType: "LineToolDateAndPriceRange",
    label: "Date and price range",
    // Box with both arrows.
    iconPath: "M4.5 4.5h19v19h-19zM14.5 7.5v13M7.5 14.5h13M12.5 9.5l2-2 2 2M18.5 12.5l2 2-2 2",
  },
};

function rangeTool(kind: Kind): DrawingToolDef {
  const m = META[kind];
  const statsDefaults = Object.fromEntries(STATS[kind].map((k) => [k, true]));
  return {
    type: m.type,
    catalogType: m.catalogType,
    family: "measure",
    section: "Measurers",
    label: m.label,
    icon: m.type,
    iconPath: m.iconPath,
    anchors: 2,
    floatingToolbar: ["templates", "line-tool-color", "background-color", "text-color", "line-tool-width", "settings", "lock", "remove", "more"],
    defaults: { color: BLUE, width: 2, fillColor: BG, textColor: "#ffffff", textSize: 12 },
    defaultProps: {
      fillBackground: true,
      fillLabelBackground: true,
      labelBackgroundColor: "#2e2e2e",
      backgroundTransparency: 60,
      showVolume: true,
      customText_visible: false,
      customText_fontsize: 12,
      customText_bold: false,
      customText_italic: false,
      customText_color: BLUE,
      ...(kind === "price" ? { extendLeft: false, extendRight: false } : {}),
      ...(kind === "date" ? { extendTop: false, extendBottom: false } : {}),
      ...(kind === "dateAndPrice" ? { drawBorder: false, borderWidth: 1, borderColor: BLUE } : {}),
      ...statsDefaults,
    },
    settings: { coordinates: "time-price", style: styleFields(kind), text: TEXT },
    hitTest(d, g, x, y, tol) {
      const [a, b] = d.anchors;
      if (!a || !b) return false;
      const p = g.toPx(a);
      const q = g.toPx(b);
      if (forecastInBox(x, y, p, q, tol)) return true;
      if (kind === "price" && (prop(d, "extendLeft", false) || prop(d, "extendRight", false))) {
        const l = prop(d, "extendLeft", false) ? -FAR : Math.min(p.x, q.x);
        const r = prop(d, "extendRight", false) ? FAR : Math.max(p.x, q.x);
        return x >= l && x <= r && (Math.abs(y - p.y) <= tol || Math.abs(y - q.y) <= tol);
      }
      return false;
    },
    render: render(kind),
    handles: anchorHandles,
    stats: (d, g) => rangeLines(d, g, kind, 2),
  };
}

export const priceRange = rangeTool("price");
export const dateRange = rangeTool("date");
export const dateAndPriceRange = rangeTool("dateAndPrice");

/** Exposed for tests: the stats of a range drawing (anchors → numbers). */
export const rangeOf = (a: Anchor, b: Anchor, g: Pick<ToolGeom, "bars" | "intervalSec">) => rangeStats(a, b, g.bars, g.intervalSec, tickSizeFor(a.price));
