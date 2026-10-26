// Icons family: built-in icon set and emoji data, pickers, resize handle, hit-tests.

import { describe, expect, it } from "vitest";
import { iconParsePath, type Anchor, type Drawing } from "@qt/core";
import { floatBinding } from "../src/chart/drawings/floatbar";
import { getTool } from "../src/chart/drawings/registry";
import { EMOJI_SET, ICON_SET } from "../src/chart/drawings/tools/icons/iconKit";
import { factoryDrawing, geom, renderLog, theme } from "./drawings/harness";

const A = (x: number, y: number): Anchor => geom.toData({ x, y });
const make = (type: string, extra: Partial<Drawing> = {}): Drawing => ({ ...factoryDrawing(getTool(type)!), anchors: [A(300, 300)], ...extra });

describe("icon data", () => {
  it("about 40 own icons that parse, about 150 emoji, unique ids", () => {
    expect(ICON_SET.length).toBeGreaterThanOrEqual(40);
    expect(new Set(ICON_SET.map((i) => i.id)).size).toBe(ICON_SET.length);
    for (const i of ICON_SET) expect(() => iconParsePath(i.d), i.id).not.toThrow();
    expect(EMOJI_SET.length).toBeGreaterThanOrEqual(150);
    expect(new Set(EMOJI_SET).size).toBe(EMOJI_SET.length);
  });
});

describe("icon tools", () => {
  it("pickers list the sets", () => {
    const pick = (type: string) => getTool(type)!.settings.tabs![0].fields[0] as { options: unknown[] };
    expect(pick("icon").options).toHaveLength(ICON_SET.length);
    expect(pick("emoji").options).toHaveLength(EMOJI_SET.length);
    expect(pick("sticker").options).toHaveLength(ICON_SET.length + EMOJI_SET.length);
  });
  it("box hit, resize handle, round sticker", () => {
    for (const type of ["icon", "emoji", "sticker"]) {
      const def = getTool(type)!;
      const d = make(type);
      expect(def.hitTest(d, geom, 300, 300, 4), type).toBe(true);
      expect(def.hitTest(d, geom, 400, 300, 4), type).toBe(false);
      const [, h] = def.handles(d, geom);
      expect(h).toEqual({ x: 336, y: 336 });
      expect(def.onAnchorDrag!(d, 1, A(350, 350), geom, {}).props?.size).toBe(100);
    }
    expect(getTool("sticker")!.hitTest(make("sticker"), geom, 334, 334, 0)).toBe(false);
    expect(getTool("icon")!.hitTest(make("icon"), geom, 334, 334, 0)).toBe(true);
  });
  it("icon color from the background button; picks change the drawing", () => {
    const def = getTool("icon")!;
    const b = floatBinding(def, "background-color", theme)!;
    expect(b.set(make("icon"), "#ff0000").style?.color).toBe("#ff0000");
    const star = JSON.stringify(renderLog(make("icon")));
    const bell = JSON.stringify(renderLog(make("icon", { props: { ...def.defaultProps, icon: "bell" } })));
    expect(star).not.toBe(bell);
    expect(JSON.stringify(renderLog(make("emoji", { props: { size: 72, emoji: "🚀" } })))).toContain("🚀");
  });
});
