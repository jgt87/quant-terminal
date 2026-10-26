import { describe, expect, it } from "vitest";
import { iconBox, iconHit, iconParsePath, iconResizeHandle, iconSizeFromHandle, ICON_DEFAULT_SIZE } from "../src/drawings/icons";

describe("icon box", () => {
  const c = { x: 100, y: 100 };
  it("square box, resize handle and size from handle", () => {
    expect(ICON_DEFAULT_SIZE).toBe(72);
    expect(iconBox(c, 72)).toEqual({ x: 64, y: 64, width: 72, height: 72 });
    expect(iconResizeHandle(c, 72)).toEqual({ x: 136, y: 136 });
    expect(iconSizeFromHandle(c, { x: 150, y: 120 })).toBe(100);
    expect(iconSizeFromHandle(c, { x: 101, y: 101 })).toBe(12);
    expect(iconSizeFromHandle(c, { x: 1000, y: 100 })).toBe(400);
  });
  it("hit: square box or round sticker", () => {
    expect(iconHit(c, 72, 135, 135, 0)).toBe(true);
    expect(iconHit(c, 72, 135, 135, 0, true)).toBe(false);
    expect(iconHit(c, 72, 100, 135, 0, true)).toBe(true);
    expect(iconHit(c, 72, 150, 100, 2)).toBe(false);
  });
});

describe("path parser", () => {
  it("absolute and relative commands", () => {
    expect(iconParsePath("M1 2L3 4H5V6Z")).toEqual([
      { c: "M", x: 1, y: 2 },
      { c: "L", x: 3, y: 4 },
      { c: "L", x: 5, y: 4 },
      { c: "L", x: 5, y: 6 },
      { c: "Z" },
    ]);
    expect(iconParsePath("m1 1 2 0l0 2")).toEqual([
      { c: "M", x: 1, y: 1 },
      { c: "L", x: 3, y: 1 },
      { c: "L", x: 3, y: 3 },
    ]);
    expect(iconParsePath("M0 0Q1 2 3 4C5 6 7 8 9 10")).toEqual([
      { c: "M", x: 0, y: 0 },
      { c: "Q", x1: 1, y1: 2, x: 3, y: 4 },
      { c: "C", x1: 5, y1: 6, x2: 7, y2: 8, x: 9, y: 10 },
    ]);
    expect(iconParsePath("M0 0L1.5-2.5")[1]).toEqual({ c: "L", x: 1.5, y: -2.5 });
    expect(() => iconParsePath("M0 0A1 1 0 0 0 2 2")).toThrow();
    expect(iconParsePath("M0 0Z 5")).toHaveLength(2);
  });
});
