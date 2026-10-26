import { describe, expect, it } from "vitest";
import { displayInterval, intervalFields, parseIntervalSpec, providerIntervalFor, providerPageLimit } from "../src/data/intervalSpec";
import { resolveSpec } from "../src/data/seriesSource";
import { changeOf, defaultLinkGroups, linkTargets } from "../src/state/links";

const spec = (s: string) => parseIntervalSpec(s)!;

describe("custom intervals", () => {
  it("parses minute, hour, day and week specs", () => {
    expect(parseIntervalSpec("2h")).toEqual({ text: "2h", seconds: 7200 });
    expect(parseIntervalSpec("45m")).toEqual({ text: "45m", seconds: 2700 });
    expect(parseIntervalSpec("3d")).toEqual({ text: "3D", seconds: 259200 });
    expect(parseIntervalSpec("2W")).toEqual({ text: "2W", seconds: 1209600 });
    expect(parseIntervalSpec("90")).toEqual({ text: "90m", seconds: 5400 });
    for (const bad of ["", "0h", "2M", "h", "1.5h", "abc", "99999W"]) expect(parseIntervalSpec(bad)).toBeNull();
  });

  it("fetches the coarsest provider interval that divides the custom interval", () => {
    expect(providerIntervalFor(spec("2h"))).toBe("1h");
    expect(providerIntervalFor(spec("3h"))).toBe("1h");
    expect(providerIntervalFor(spec("6h"))).toBe("1h");
    expect(providerIntervalFor(spec("12h"))).toBe("4h");
    expect(providerIntervalFor(spec("2D"))).toBe("1D");
    expect(providerIntervalFor(spec("3D"))).toBe("1D");
    expect(providerIntervalFor(spec("45m"))).toBe("15m");
    expect(providerIntervalFor(spec("90m"))).toBe("30m");
    expect(providerIntervalFor(spec("7m"))).toBe("1m");
    expect(providerIntervalFor(spec("2W"))).toBe("1W");
  });

  it("maps a picked interval to layout fields (native intervals clear the custom one)", () => {
    expect(intervalFields("2h")).toEqual({ interval: "1h", customInterval: "2h" });
    expect(intervalFields("4h")).toEqual({ interval: "4h", customInterval: undefined });
    expect(intervalFields("1d")).toEqual({ interval: "1D", customInterval: undefined });
    expect(intervalFields("nope")).toBeNull();
    expect(displayInterval("1h", "2h")).toBe("2h");
    expect(displayInterval("1h", undefined)).toBe("1h");
  });

  it("sizes provider pages so one page gives about a page of custom bars", () => {
    expect(providerPageLimit(spec("2h"), "1h", 1000)).toBe(2000);
    expect(providerPageLimit(spec("12h"), "4h", 1000)).toBe(3000);
    expect(providerPageLimit(spec("45m"), "15m", 1000)).toBe(3000);
    expect(providerPageLimit(spec("3h"), "1h", 2000)).toBe(5000); // server maximum
  });

  it("resolves a layout spec to the fetch plan", () => {
    const r = resolveSpec({ symbol: "AAPL", interval: "1h", customInterval: "2h" }, 1000);
    expect(r).toMatchObject({ provider: "1h", seconds: 7200, limit: 2000 });
    expect(r.plan.fromSec).toBe(3600);
    expect(r.plan.toSec).toBe(7200);
    const plain = resolveSpec({ symbol: "AAPL", interval: "1D" }, 1000);
    expect(plain).toMatchObject({ provider: "1D", seconds: 86400, limit: 1000 });
    const formula = resolveSpec({ symbol: "AAPL/MSFT", interval: "1D" }, 1000);
    expect(formula.plan.legs).toEqual(["AAPL", "MSFT"]);
  });

  it("propagates a custom interval to linked charts (interval links on)", () => {
    const groups = defaultLinkGroups().map((g) => (g.color === "red" ? { ...g, interval: true } : g));
    const cells = [{ layoutId: "a", link: "red" as const }, { layoutId: "b", link: "red" as const }];
    const change = changeOf({ symbol: "AAPL", interval: "1D" }, { symbol: "AAPL", interval: "1h", customInterval: "2h" });
    expect(change).toEqual({ interval: "1h", customInterval: "2h" });
    const up = linkTargets(cells, 2, groups, 0, change, [null, { symbol: "AAPL", interval: "1D" }]);
    expect(up).toEqual([{ index: 1, patch: { interval: "1h", customInterval: "2h" } }]);
    // Back to a native interval clears the custom one on the target.
    const back = changeOf({ symbol: "AAPL", interval: "1h", customInterval: "2h" }, { symbol: "AAPL", interval: "1h" });
    expect(back).toEqual({ interval: "1h", customInterval: undefined });
    expect(linkTargets(cells, 2, groups, 0, back, [null, { symbol: "AAPL", interval: "1h", customInterval: "2h" }])).toEqual([
      { index: 1, patch: { interval: "1h", customInterval: undefined } },
    ]);
  });
});
