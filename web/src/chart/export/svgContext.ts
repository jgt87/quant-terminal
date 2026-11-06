// A CanvasRenderingContext2D stand-in that records drawing as SVG: the chart renders into it
// exactly as into a canvas (paths, fills, strokes, dashes, text, clips, linear / radial gradients,
// affine transforms). Images and pixel access are not supported and draw nothing.

type Matrix = [number, number, number, number, number, number];

interface Gradient {
  kind: "linear" | "radial";
  coords: number[];
  stops: [number, string][];
  addColorStop(offset: number, color: string): void;
}

interface State {
  fillStyle: string | Gradient;
  strokeStyle: string | Gradient;
  lineWidth: number;
  lineCap: string;
  lineJoin: string;
  miterLimit: number;
  globalAlpha: number;
  font: string;
  textAlign: string;
  textBaseline: string;
  dash: number[];
  dashOffset: number;
  m: Matrix;
  clip: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const n = (v: number) => (Math.round(v * 100) / 100).toString();

/** Splits a CSS font shorthand ("500 11px Inter, sans-serif") into SVG attributes. */
export function fontAttrs(font: string): string {
  const m = /^\s*(?:(italic|oblique)\s+)?(?:(normal|bold|bolder|lighter|\d{3})\s+)?([\d.]+)px\s+(.+)$/.exec(font);
  if (!m) return `font-size="10" font-family="sans-serif"`;
  const style = m[1] ? ` font-style="${m[1]}"` : "";
  const weight = m[2] && m[2] !== "normal" ? ` font-weight="${m[2]}"` : "";
  return `font-size="${m[3]}" font-family="${esc(m[4])}"${weight}${style}`;
}

const ANCHOR: Record<string, string> = { left: "start", start: "start", center: "middle", right: "end", end: "end" };
const BASELINE: Record<string, string> = { top: "hanging", hanging: "hanging", middle: "central", alphabetic: "alphabetic", ideographic: "ideographic", bottom: "text-after-edge" };

export class SvgContext {
  readonly width: number;
  readonly height: number;
  private s: State;
  private stack: State[] = [];
  private path: string[] = [];
  private cur: [number, number] | null = null;
  private start: [number, number] | null = null;
  private body: string[] = [];
  private defs: string[] = [];
  private ids = 0;
  private measure: CanvasRenderingContext2D | null;
  /** Lets `canvas.width` reads work for code that asks the context for its canvas. */
  readonly canvas: { width: number; height: number };

  constructor(width: number, height: number, measure: CanvasRenderingContext2D | null = null) {
    this.width = width;
    this.height = height;
    this.canvas = { width, height };
    this.measure = measure;
    this.s = {
      fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, lineCap: "butt", lineJoin: "miter", miterLimit: 10, globalAlpha: 1,
      font: "10px sans-serif", textAlign: "start", textBaseline: "alphabetic", dash: [], dashOffset: 0, m: [1, 0, 0, 1, 0, 0], clip: null,
    };
  }

  /** The finished SVG document. */
  toSvg(): string {
    const defs = this.defs.length ? `<defs>${this.defs.join("")}</defs>` : "";
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">${defs}${this.body.join("")}</svg>`;
  }

  // ----- state -----
  get fillStyle(): string | Gradient { return this.s.fillStyle; }
  set fillStyle(v: string | Gradient) { this.s.fillStyle = v; }
  get strokeStyle(): string | Gradient { return this.s.strokeStyle; }
  set strokeStyle(v: string | Gradient) { this.s.strokeStyle = v; }
  get lineWidth(): number { return this.s.lineWidth; }
  set lineWidth(v: number) { if (v > 0 && Number.isFinite(v)) this.s.lineWidth = v; }
  get lineCap(): string { return this.s.lineCap; }
  set lineCap(v: string) { this.s.lineCap = v; }
  get lineJoin(): string { return this.s.lineJoin; }
  set lineJoin(v: string) { this.s.lineJoin = v; }
  get miterLimit(): number { return this.s.miterLimit; }
  set miterLimit(v: number) { this.s.miterLimit = v; }
  get globalAlpha(): number { return this.s.globalAlpha; }
  set globalAlpha(v: number) { if (v >= 0 && v <= 1) this.s.globalAlpha = v; }
  get font(): string { return this.s.font; }
  set font(v: string) { this.s.font = v; }
  get textAlign(): string { return this.s.textAlign; }
  set textAlign(v: string) { this.s.textAlign = v; }
  get textBaseline(): string { return this.s.textBaseline; }
  set textBaseline(v: string) { this.s.textBaseline = v; }
  get lineDashOffset(): number { return this.s.dashOffset; }
  set lineDashOffset(v: number) { this.s.dashOffset = v; }
  setLineDash(d: number[]): void { this.s.dash = d.filter((x) => Number.isFinite(x) && x >= 0); }
  getLineDash(): number[] { return [...this.s.dash]; }

  save(): void { this.stack.push({ ...this.s, dash: [...this.s.dash], m: [...this.s.m] as Matrix }); }
  restore(): void { const s = this.stack.pop(); if (s) this.s = s; }

  // ----- transforms -----
  setTransform(a: number | DOMMatrix2DInit, b = 0, c = 0, d = 1, e = 0, f = 0): void {
    if (typeof a === "object") this.s.m = [a.a ?? 1, a.b ?? 0, a.c ?? 0, a.d ?? 1, a.e ?? 0, a.f ?? 0];
    else this.s.m = [a, b, c, d, e, f];
  }
  resetTransform(): void { this.s.m = [1, 0, 0, 1, 0, 0]; }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const [A, B, C, D, E, F] = this.s.m;
    this.s.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, A * e + C * f + E, B * e + D * f + F];
  }
  translate(x: number, y: number): void { this.transform(1, 0, 0, 1, x, y); }
  scale(x: number, y: number): void { this.transform(x, 0, 0, y, 0, 0); }
  rotate(r: number): void { const c = Math.cos(r), s = Math.sin(r); this.transform(c, s, -s, c, 0, 0); }
  getTransform(): DOMMatrix2DInit { const [a, b, c, d, e, f] = this.s.m; return { a, b, c, d, e, f }; }

  private pt(x: number, y: number): [number, number] {
    const [a, b, c, d, e, f] = this.s.m;
    return [a * x + c * y + e, b * x + d * y + f];
  }
  /** Average scale of the current transform (line widths, radii, font sizes). */
  private k(): number {
    const [a, b, c, d] = this.s.m;
    return Math.sqrt(Math.abs(a * d - b * c)) || 1;
  }

  // ----- paths -----
  beginPath(): void { this.path = []; this.cur = null; this.start = null; }
  moveTo(x: number, y: number): void {
    const p = this.pt(x, y);
    this.path.push(`M${n(p[0])} ${n(p[1])}`);
    this.cur = this.start = p;
  }
  lineTo(x: number, y: number): void {
    if (!this.cur) return this.moveTo(x, y);
    const p = this.pt(x, y);
    this.path.push(`L${n(p[0])} ${n(p[1])}`);
    this.cur = p;
  }
  closePath(): void {
    if (!this.cur) return;
    this.path.push("Z");
    this.cur = this.start;
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(cx, cy);
    const c = this.pt(cx, cy);
    const p = this.pt(x, y);
    this.path.push(`Q${n(c[0])} ${n(c[1])} ${n(p[0])} ${n(p[1])}`);
    this.cur = p;
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!this.cur) this.moveTo(c1x, c1y);
    const a = this.pt(c1x, c1y);
    const b = this.pt(c2x, c2y);
    const p = this.pt(x, y);
    this.path.push(`C${n(a[0])} ${n(a[1])} ${n(b[0])} ${n(b[1])} ${n(p[0])} ${n(p[1])}`);
    this.cur = p;
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }
  roundRect(x: number, y: number, w: number, h: number): void { this.rect(x, y, w, h); }
  /** Arcs and ellipses become short line segments (exact under any affine transform). */
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    let sweep = a1 - a0;
    if (!ccw && sweep < 0) sweep = (sweep % (2 * Math.PI)) + 2 * Math.PI;
    if (ccw && sweep > 0) sweep = (sweep % (2 * Math.PI)) - 2 * Math.PI;
    if (Math.abs(a1 - a0) >= 2 * Math.PI) sweep = ccw ? -2 * Math.PI : 2 * Math.PI;
    const steps = Math.max(8, Math.ceil((Math.abs(sweep) / (2 * Math.PI)) * 48));
    const cr = Math.cos(rot), sr = Math.sin(rot);
    for (let i = 0; i <= steps; i++) {
      const t = a0 + (sweep * i) / steps;
      const ex = rx * Math.cos(t), ey = ry * Math.sin(t);
      const px = x + ex * cr - ey * sr, py = y + ex * sr + ey * cr;
      if (i === 0 && this.cur) this.lineTo(px, py);
      else if (i === 0) this.moveTo(px, py);
      else this.lineTo(px, py);
    }
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  arcTo(x1: number, y1: number): void { this.lineTo(x1, y1); }

  // ----- painting -----
  private paint(style: string | Gradient): string {
    if (typeof style === "string") return esc(style);
    const id = `g${++this.ids}`;
    const stops = style.stops.map(([o, c]) => `<stop offset="${n(o)}" stop-color="${esc(c)}"/>`).join("");
    if (style.kind === "linear") {
      const [x0, y0, x1, y1] = style.coords;
      const a = this.pt(x0, y0), b = this.pt(x1, y1);
      this.defs.push(`<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${n(a[0])}" y1="${n(a[1])}" x2="${n(b[0])}" y2="${n(b[1])}">${stops}</linearGradient>`);
    } else {
      const [x0, y0, , x1, y1, r1] = style.coords;
      const c = this.pt(x1, y1), f = this.pt(x0, y0);
      this.defs.push(`<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${n(c[0])}" cy="${n(c[1])}" fx="${n(f[0])}" fy="${n(f[1])}" r="${n(r1 * this.k())}">${stops}</radialGradient>`);
    }
    return `url(#${id})`;
  }
  private common(): string {
    const a = this.s.globalAlpha < 1 ? ` opacity="${n(this.s.globalAlpha)}"` : "";
    const c = this.s.clip ? ` clip-path="url(#${this.s.clip})"` : "";
    return a + c;
  }
  private strokeAttrs(): string {
    const k = this.k();
    const dash = this.s.dash.length ? ` stroke-dasharray="${this.s.dash.map((d) => n(d * k)).join(" ")}"${this.s.dashOffset ? ` stroke-dashoffset="${n(this.s.dashOffset * k)}"` : ""}` : "";
    return `stroke="${this.paint(this.s.strokeStyle)}" stroke-width="${n(this.s.lineWidth * k)}" stroke-linecap="${this.s.lineCap}" stroke-linejoin="${this.s.lineJoin}"${dash}`;
  }
  fill(rule?: string): void {
    if (!this.path.length) return;
    const r = rule === "evenodd" ? ` fill-rule="evenodd"` : "";
    this.body.push(`<path d="${this.path.join("")}" fill="${this.paint(this.s.fillStyle)}"${r}${this.common()}/>`);
  }
  stroke(): void {
    if (!this.path.length) return;
    this.body.push(`<path d="${this.path.join("")}" fill="none" ${this.strokeAttrs()}${this.common()}/>`);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const keep = this.path;
    this.path = [];
    this.rect(x, y, w, h);
    this.fill();
    this.path = keep;
  }
  strokeRect(x: number, y: number, w: number, h: number): void {
    const keep = this.path;
    this.path = [];
    this.rect(x, y, w, h);
    this.stroke();
    this.path = keep;
  }
  clearRect(): void {
    /* the chart paints its own background */
  }
  clip(rule?: string): void {
    if (!this.path.length) return;
    const id = `c${++this.ids}`;
    const parent = this.s.clip ? ` clip-path="url(#${this.s.clip})"` : "";
    this.defs.push(`<clipPath id="${id}"${parent}><path d="${this.path.join("")}"${rule === "evenodd" ? ` clip-rule="evenodd"` : ""}/></clipPath>`);
    this.s.clip = id;
  }

  // ----- text -----
  private text(t: string, x: number, y: number, how: "fill" | "stroke"): void {
    const p = this.pt(x, y);
    const k = this.k();
    let font = fontAttrs(this.s.font);
    if (k !== 1) font = font.replace(/font-size="([\d.]+)"/, (_, s) => `font-size="${n(Number(s) * k)}"`);
    const paint = how === "fill" ? `fill="${this.paint(this.s.fillStyle)}"` : `fill="none" ${this.strokeAttrs()}`;
    const anchor = ANCHOR[this.s.textAlign] ?? "start";
    const base = BASELINE[this.s.textBaseline] ?? "alphabetic";
    this.body.push(`<text x="${n(p[0])}" y="${n(p[1])}" ${font} text-anchor="${anchor}" dominant-baseline="${base}" ${paint}${this.common()} xml:space="preserve">${esc(t)}</text>`);
  }
  fillText(t: string, x: number, y: number): void { this.text(String(t), x, y, "fill"); }
  strokeText(t: string, x: number, y: number): void { this.text(String(t), x, y, "stroke"); }
  measureText(t: string): TextMetrics {
    if (this.measure) {
      this.measure.font = this.s.font;
      return this.measure.measureText(t);
    }
    const size = Number(/([\d.]+)px/.exec(this.s.font)?.[1] ?? 10);
    return { width: String(t).length * size * 0.55, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 } as TextMetrics;
  }

  // ----- gradients and unsupported calls -----
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient {
    const g: Gradient = { kind: "linear", coords: [x0, y0, x1, y1], stops: [], addColorStop: (o, c) => void g.stops.push([o, c]) };
    return g;
  }
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient {
    const g: Gradient = { kind: "radial", coords: [x0, y0, r0, x1, y1, r1], stops: [], addColorStop: (o, c) => void g.stops.push([o, c]) };
    return g;
  }
  drawImage(): void {}
  createPattern(): null { return null; }
  isPointInPath(): boolean { return false; }
  isPointInStroke(): boolean { return false; }
}

/** The context typed as a canvas context for the chart renderers (unknown members do nothing). */
export function asCanvasContext(svg: SvgContext): CanvasRenderingContext2D {
  return new Proxy(svg, {
    get(target, prop, recv) {
      if (prop in target) {
        const v = Reflect.get(target, prop, recv);
        return typeof v === "function" ? v.bind(target) : v;
      }
      return () => undefined;
    },
    set(target, prop, value) {
      if (prop in target) return Reflect.set(target, prop, value);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}
