import { describe, expect, it } from "vitest";
import { placeMenu, placeSubmenu } from "../src/components/menuPosition";

describe("placeMenu", () => {
  it("opens down-right of the pointer when it fits", () => {
    expect(placeMenu(100, 100, 200, 300, 1600, 900)).toEqual({ left: 100, top: 100 });
  });
  it("flips left near the right edge and up near the bottom", () => {
    expect(placeMenu(1500, 800, 200, 300, 1600, 900)).toEqual({ left: 1300, top: 500 });
  });
  it("clamps inside the margins when it cannot flip", () => {
    // Taller than the space above and below: flipped up, then clamped to the top margin.
    expect(placeMenu(50, 200, 200, 600, 1600, 700)).toEqual({ left: 50, top: 4 });
    // Wider than the viewport: pinned to the left margin.
    expect(placeMenu(10, 10, 500, 100, 300, 900).left).toBe(4);
  });
  it("never leaves the viewport for any pointer position", () => {
    for (let x = 0; x <= 1000; x += 37) {
      for (let y = 0; y <= 700; y += 41) {
        const p = placeMenu(x, y, 220, 260, 1000, 700);
        expect(p.left).toBeGreaterThanOrEqual(4);
        expect(p.top).toBeGreaterThanOrEqual(4);
        expect(p.left + 220).toBeLessThanOrEqual(996);
        expect(p.top + 260).toBeLessThanOrEqual(696);
      }
    }
  });
});

describe("placeSubmenu", () => {
  const item = { left: 300, right: 500, top: 200, bottom: 226 };
  it("opens to the right of the item", () => {
    expect(placeSubmenu(item, 180, 120, 1600, 900)).toEqual({ left: 500, top: 196 });
  });
  it("opens to the left when the right side is too narrow", () => {
    expect(placeSubmenu(item, 180, 120, 600, 900).left).toBe(120);
  });
  it("shifts up to stay above the bottom edge", () => {
    expect(placeSubmenu({ ...item, top: 850, bottom: 876 }, 180, 200, 1600, 900).top).toBe(696);
  });
});
