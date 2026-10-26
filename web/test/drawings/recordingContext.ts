// A recording CanvasRenderingContext2D for the drawing conformance harness: every paint call is
// logged with the style state at that moment (stroke/fill style, width, dash, alpha, font, text
// alignment) and the current path, so two renders can be compared. Unknown methods are logged too.

export interface DrawCall {
  op: string;
  args: unknown[];
  state: Record<string, unknown>;
  path?: string;
}

const STATE_KEYS = ["strokeStyle", "fillStyle", "lineWidth", "globalAlpha", "font", "textAlign", "textBaseline", "lineCap", "lineJoin"] as const;
const PAINT = new Set(["stroke", "fill", "fillRect", "strokeRect", "fillText", "strokeText", "clearRect", "drawImage"]);
const PATH = new Set(["moveTo", "lineTo", "arc", "arcTo", "ellipse", "rect", "roundRect", "quadraticCurveTo", "bezierCurveTo", "closePath"]);
const r = (v: unknown) => (typeof v === "number" ? Math.round(v * 100) / 100 : v);

export function recordingContext(): { ctx: CanvasRenderingContext2D; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const state: Record<string, unknown> = {
    strokeStyle: "#000000",
    fillStyle: "#000000",
    lineWidth: 1,
    globalAlpha: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    lineCap: "butt",
    lineJoin: "miter",
  };
  let dash: number[] = [];
  let transform = [1, 0, 0, 1, 0, 0];
  const stack: { s: Record<string, unknown>; dash: number[]; t: number[] }[] = [];
  let path: string[] = [];
  const gradient = (kind: string, a: number[]) => {
    const g = { kind, args: a.map(r), stops: [] as [number, string][], addColorStop: (o: number, c: string) => void g.stops.push([r(o) as number, c]) };
    calls.push({ op: `create${kind}Gradient`, args: a.map(r), state: {} });
    return new Proxy(g, { get: (t, k: string) => (k === "toJSON" ? () => ({ kind: t.kind, args: t.args, stops: t.stops }) : (t as Record<string, unknown>)[k]) });
  };
  const snapshot = () => ({ ...Object.fromEntries(STATE_KEYS.map((k) => [k, r(state[k])])), dash: dash.map(r), transform: transform.map(r) });
  const target: Record<string, unknown> = {
    canvas: { width: 800, height: 600 },
    save() {
      stack.push({ s: { ...state }, dash: [...dash], t: [...transform] });
    },
    restore() {
      const top = stack.pop();
      if (top) {
        Object.assign(state, top.s);
        dash = top.dash;
        transform = top.t;
      }
    },
    beginPath() {
      path = [];
    },
    setLineDash(d: number[]) {
      dash = [...d];
    },
    getLineDash() {
      return [...dash];
    },
    measureText(text: string) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10);
      return { width: String(text).length * size * 0.55, actualBoundingBoxAscent: size * 0.8, actualBoundingBoxDescent: size * 0.2 };
    },
    translate(x: number, y: number) {
      transform = [transform[0], transform[1], transform[2], transform[3], transform[4] + x, transform[5] + y];
      calls.push({ op: "translate", args: [r(x), r(y)], state: snapshot() });
    },
    rotate(a: number) {
      calls.push({ op: "rotate", args: [r(a)], state: snapshot() });
    },
    scale(x: number, y: number) {
      calls.push({ op: "scale", args: [r(x), r(y)], state: snapshot() });
    },
    setTransform(...a: number[]) {
      transform = a.length >= 6 ? a.slice(0, 6) : [1, 0, 0, 1, 0, 0];
    },
    resetTransform() {
      transform = [1, 0, 0, 1, 0, 0];
    },
    clip() {
      calls.push({ op: "clip", args: [], state: snapshot(), path: path.join(" ") });
    },
    createLinearGradient: (...a: number[]) => gradient("linear", a),
    createRadialGradient: (...a: number[]) => gradient("radial", a),
    createPattern: () => null,
    isPointInPath: () => false,
    isPointInStroke: () => false,
  };
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(t, key: string) {
      if (key in t) return t[key];
      if (STATE_KEYS.includes(key as (typeof STATE_KEYS)[number])) return state[key];
      if (key === "lineDashOffset" || key.startsWith("shadow") || key === "imageSmoothingEnabled" || key === "filter" || key === "globalCompositeOperation" || key === "miterLimit")
        return state[key];
      return (...args: unknown[]) => {
        if (PATH.has(key)) path.push(`${key}(${args.map(r).join(",")})`);
        else if (PAINT.has(key)) calls.push({ op: key, args: args.map(r), state: snapshot(), path: key === "stroke" || key === "fill" ? path.join(" ") : undefined });
        else calls.push({ op: key, args: args.map(r), state: snapshot() });
      };
    },
    set(_t, key: string, value) {
      state[key] = value;
      return true;
    },
  };
  return { ctx: new Proxy(target, handler) as unknown as CanvasRenderingContext2D, calls };
}
