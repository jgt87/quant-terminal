import { describe, expect, it } from "vitest";
import { parseHex, toHex } from "../src/components/colorValue";
import { withAlpha } from "../src/chart/theme";

describe("color values", () => {
  it("parses #rgb, #rrggbb and #rrggbbaa", () => {
    expect(parseHex("#fff")).toEqual({ hex: "#ffffff", alpha: 1 });
    expect(parseHex("#2962FF")).toEqual({ hex: "#2962ff", alpha: 1 });
    expect(parseHex("#2962ff80")).toEqual({ hex: "#2962ff", alpha: 0.5 });
    expect(parseHex("blue")).toBeNull();
  });
  it("round-trips through toHex", () => {
    expect(toHex("#2962ff", 1)).toBe("#2962ff");
    expect(toHex("#2962FF", 0.5)).toBe("#2962ff80");
    expect(parseHex(toHex("#ef5350", 0.25))?.alpha).toBeCloseTo(0.25, 2);
  });
  it("withAlpha multiplies alpha into rgba()", () => {
    expect(withAlpha("#ef5350", 0.25)).toBe("rgba(239,83,80,0.25)");
    expect(withAlpha("#ef535080", 0.5)).toBe("rgba(239,83,80,0.251)");
    expect(withAlpha("rgba(1,2,3,0.4)", 0.5)).toBe("rgba(1,2,3,0.4)");
  });
});
