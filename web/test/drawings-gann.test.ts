import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Anchor, Drawing } from "@qt/core";
import { getTool } from "../src/chart/drawings/registry";
import { getField, setField } from "../src/chart/drawings/schema";
import { GANN } from "../src/chart/drawings/tools/gann";
import type { DrawCtx, DrawingToolDef, LevelRow, ValueField } from "../src/chart/drawings/types";
import { THEME } from "../src/chart/theme";

const catalog = JSON.parse(readFileSync(fileURLToPath(new URL("../../docs/reference/drawing-tools-catalog.json", import.meta.url)), "utf8")) as {
  type: string;
  label: string;
  anchors: number;
  floatingToolbar: string[];
  contextMenuExtras: unknown[];
  contextMenuSequence: string[];
  settingsTabs: { tab: string; fields: { key: string; type: string; default: unknown }[] }[];
}[];

// Projection: time = x seconds (one 60 s bar = 60 px), price = 1000 - y.
const toPx = (a: Anchor) => ({ x: a.time, y: 1000 - a.price });
const toData = (p: { x: number; y: number }): Anchor => ({ time: Math.round(p.x), price: 1000 - p.y });
const A = (x: number, y: number): Anchor => toData({ x, y });
const geom = { toPx, toData, viewport: { width: 800, height: 600 }, bars: [], intervalSec: 60 };

function recorder(): { ctx: CanvasRenderingContext2D; log: string[] } {
  const log: string[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_t, k: string) {
      if (k === "measureText") return (s: string) => ({ width: s.length * 6 });
      if (k in target) return target[k];
      return (...args: unknown[]) => {
        log.push(`${k}(${args.map((a) => (typeof a === "number" ? a.toFixed(1) : String(a))).join(",")})`);
      };
    },
    set(_t, k: string, v) {
      target[k] = v;
      log.push(`${k}=${String(v)}`);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, log };
}

function render(def: DrawingToolDef, d: Drawing): string[] {
  const { ctx, log } = recorder();
  const c = {
    ctx,
    theme: THEME,
    dpr: 1,
    width: 800,
    height: 600,
    ...geom,
    color: d.style?.color ?? THEME.drawing,
    selected: false,
    hovered: false,
    formatPrice: (p: number) => p.toFixed(2),
    priceDecimals: 2,
  } as unknown as DrawCtx;
  def.render(c, d);
  return log;
}

const make = (def: DrawingToolDef, anchors: Anchor[] = [A(100, 450), A(400, 150)]): Drawing => ({
  id: def.type,
  type: def.type,
  anchors,
  style: structuredClone(def.defaults),
  props: structuredClone(def.defaultProps ?? {}),
});

const expected: [string, string][] = [
  ["gannBox", "LineToolGannSquare"],
  ["gannSquareFixed", "LineToolGannFixed"],
  ["gannSquare", "LineToolGannComplex"],
  ["gannFan", "LineToolGannFan"],
];

/** Catalog keys a level table covers: `<prefix><n>.<part>` for every row. */
function levelKeys(f: ValueField & { kind: "levels" }, keys: string[]): string[] {
  const p = f.catalogLevels!.prefix;
  return keys.filter((k) => k.startsWith(p) && /^\d+\./.test(k.slice(p.length)));
}

describe("Gann family", () => {
  it("registers the catalog tools in flyout order", () => {
    expect(GANN.map((t) => [t.type, t.catalogType])).toEqual(expected);
    for (const t of GANN) {
      expect(getTool(t.type)).toBe(t);
      expect(t.family).toBe("gann");
      const cat = catalog.find((c) => c.type === t.catalogType)!;
      expect(t.label).toBe(cat.label);
      expect(t.anchors).toBe(cat.anchors);
      expect(t.floatingToolbar).toEqual(cat.floatingToolbar.map((b) => b.split(" ")[0]));
      expect(cat.contextMenuExtras).toEqual([]);
      expect(cat.contextMenuSequence).not.toContain("Add alert");
      expect(t.alert).toBeUndefined();
      expect(t.menuSection).toBeUndefined();
      expect(t.iconPath).toBeTruthy();
      expect(t.settings.coordinates).toBe("time-price");
    }
  });

  it("covers every catalog Style field (level groups through their tables)", () => {
    for (const t of GANN) {
      const cat = catalog.find((c) => c.type === t.catalogType)!;
      const keys = cat.settingsTabs.find((x) => x.tab === "Style")!.fields.map((f) => f.key);
      const ours = t.settings.style.filter((f): f is ValueField => f.kind !== "section");
      const covered = new Set<string>();
      for (const f of ours) {
        if (f.kind === "levels") levelKeys(f, keys).forEach((k) => covered.add(k));
        else if (f.catalog) covered.add(f.catalog);
      }
      expect(keys.filter((k) => !covered.has(k)), t.type).toEqual([]);
      expect([...covered].filter((k) => !keys.includes(k)), t.type).toEqual([]);
    }
  });

  it("factory level rows match the catalog (visible, color, width)", () => {
    for (const t of GANN) {
      const cat = catalog.find((c) => c.type === t.catalogType)!;
      const fields = cat.settingsTabs.find((x) => x.tab === "Style")!.fields;
      for (const f of t.settings.style) {
        if (f.kind !== "levels") continue;
        const rows = getField(make(t), f.key) as LevelRow[];
        expect(rows, `${t.type} ${f.key}`).toEqual(f.defaults(THEME));
        const p = f.catalogLevels!.prefix;
        for (const cf of fields) {
          const m = new RegExp(`^${p.replace(".", "\\.")}(\\d+)\\.(\\w+)$`).exec(cf.key);
          if (!m) continue;
          // Gann box / fan rows are numbered from 1, the squares' from 0.
          const row = rows[p.endsWith(".") ? +m[1] : +m[1] - 1];
          const part = m[2];
          if (part === "visible") expect(row.visible, cf.key).toBe(cf.default);
          if (part === "color") expect(row.color, cf.key).toBe(String(cf.default).toLowerCase());
          if (part === "width" || part === "linewidth") expect(row.width, cf.key).toBe(cf.default);
          if (part === "linestyle") expect(row.lineStyle, cf.key).toBe("solid");
          if (part === "coeff") expect(row.ratio, cf.key).toBe(cf.default);
        }
      }
    }
  });

  it("non-level fields carry the catalog factory default", () => {
    for (const t of GANN) {
      const cat = catalog.find((c) => c.type === t.catalogType)!;
      for (const cf of cat.settingsTabs.find((x) => x.tab === "Style")!.fields) {
        const f = t.settings.style.find((x) => x.kind !== "section" && x.kind !== "levels" && x.catalog === cf.key) as ValueField | undefined;
        if (!f) continue;
        const v = getField(make(t), f.key);
        const want = cf.type === "color" && typeof cf.default === "string" ? cf.default.toLowerCase() : cf.default;
        expect(f.default, `${t.type} ${cf.key} field default`).toEqual(want);
        if (v !== undefined) expect(v, `${t.type} ${cf.key} factory`).toEqual(want);
      }
    }
  });

  it("every Style field changes the rendering", () => {
    for (const t of GANN) {
      for (const f of t.settings.style) {
        if (f.kind === "section") continue;
        const base = f.testWith ? f.testWith(make(t)) : make(t);
        const cur = getField(base, f.key);
        let next: unknown = f.testValue;
        if (next === undefined) {
          if (f.kind === "checkbox") next = !cur;
          else if (f.kind === "color") next = "#123456";
          else if (f.kind === "fontSize") next = 20;
          else if (f.kind === "levels") next = (cur as LevelRow[]).map((r) => ({ ...r, color: "#123456", visible: true }));
        }
        expect(next, `${t.type} ${f.key}`).not.toBeUndefined();
        expect(render(t, setField(base, f.key, next)), `${t.type} ${f.key} wired`).not.toEqual(render(t, base));
      }
    }
  });

  it("coordinates move the geometry", () => {
    for (const t of GANN) {
      const d = make(t);
      const moved = { ...d, anchors: [A(130, 420), d.anchors[1]] };
      expect(render(t, moved), t.type).not.toEqual(render(t, d));
    }
  });

  it("renders the creation preview with one or two anchors", () => {
    for (const t of GANN) {
      expect(() => render(t, make(t, [A(100, 450)]))).not.toThrow();
      expect(render(t, make(t)).some((l) => l.startsWith("lineTo"))).toBe(true);
    }
  });

  it("hits a stroke and misses away from the drawing", () => {
    const hits: Record<string, [number, number]> = {
      gannBox: [250, 450], // bottom edge
      gannSquareFixed: [100, 300], // left edge (square 300 x 300 upwards from (100, 450))
      gannSquare: [400, 300], // right edge
      gannFan: [250, 300], // 1/1 ray through the anchors
    };
    for (const t of GANN) {
      const d = make(t);
      expect(t.hitTest(d, geom, ...hits[t.type], 6), `${t.type} hit`).toBe(true);
      expect(t.hitTest(d, geom, 760, 580, 6), `${t.type} miss`).toBe(false);
      expect(t.handles(d, geom).length).toBe(2);
    }
  });

  it("Gann square applies a fixed price/bar ratio to the second corner", () => {
    const t = getTool("gannSquare")!;
    const d = setField(make(t), "props.scaleRatio", 0.5); // 300 px = 5 bars → 2.5 price
    const [, h] = t.handles(d, geom);
    expect(h).toEqual({ x: 400, y: 450 - 2.5 });
    const dragged = t.onAnchorDrag!(d, 1, A(460, 100), geom, {});
    expect(dragged.anchors[1]).toEqual({ time: 460, price: 550 + 3 });
  });

  it("Gann square fixed stays square on screen", () => {
    const t = getTool("gannSquareFixed")!;
    const [p, q] = t.handles(make(t, [A(100, 450), A(250, 400)]), geom);
    expect(Math.abs(q.x - p.x)).toBe(Math.abs(q.y - p.y));
  });

  it("toolbar color / width act on every level row", () => {
    for (const t of GANN) {
      const b = t.floatBindings?.["line-tool-color"];
      expect(b, t.type).toBeTruthy();
      if (!b || typeof b === "string") continue;
      const d = b.set(make(t), "#abcdef");
      expect(b.get(d, THEME)).toBe("#abcdef");
      for (const f of t.settings.style) if (f.kind === "levels") expect((getField(d, f.key) as LevelRow[]).every((r) => r.color === "#abcdef")).toBe(true);
    }
  });

  it("drawings survive a JSON round trip", () => {
    for (const t of GANN) {
      const d = make(t);
      expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    }
  });
});
