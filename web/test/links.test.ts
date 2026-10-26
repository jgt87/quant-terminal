import { describe, expect, it } from "vitest";
import type { LinkGroup } from "@qt/core";
import {
  changeOf,
  crosshairTargets,
  defaultLinkGroups,
  joinPatch,
  linkTargets,
  normalizeLinkGroups,
  timeTargets,
  type CellValues,
  type LinkCell,
} from "../src/state/links";

const cells: LinkCell[] = [
  { layoutId: "a", link: "red" },
  { layoutId: "b", link: "red" },
  { layoutId: "c" },
  { layoutId: "d", link: "blue" },
  { layoutId: "e", link: "red" }, // beyond the visible count in most tests
];
const vals: CellValues[] = [
  { symbol: "AAPL", interval: "1D" },
  { symbol: "AAPL", interval: "1h" },
  { symbol: "MSFT", interval: "1D" },
  { symbol: "BTCUSDT", interval: "1D" },
  { symbol: "AAPL", interval: "1D" },
];
const groups = (patch: Partial<LinkGroup> = {}) => defaultLinkGroups().map((g) => (g.color === "red" ? { ...g, ...patch } : g));

describe("link propagation", () => {
  it("defaults: symbol linked, interval and time not", () => {
    expect(normalizeLinkGroups(undefined).every((g) => g.symbol && !g.interval && !g.time)).toBe(true);
    expect(normalizeLinkGroups([{ color: "red", interval: true }])[0]).toEqual({ color: "red", symbol: true, interval: true, time: false });
    expect(normalizeLinkGroups(undefined)).toHaveLength(9);
  });

  it("computes the change between two states", () => {
    expect(changeOf(vals[0], { symbol: "TSLA", interval: "1D" })).toEqual({ symbol: "TSLA" });
    expect(changeOf(vals[0], vals[0])).toEqual({});
  });

  it("sends a symbol change to the same color only, within the visible cells", () => {
    const t = linkTargets(cells, 4, groups(), 0, { symbol: "TSLA" }, vals);
    expect(t).toEqual([{ index: 1, patch: { symbol: "TSLA" } }]);
    expect(linkTargets(cells, 5, groups(), 0, { symbol: "TSLA" }, vals).map((x) => x.index)).toEqual([1, 4]);
  });

  it("does nothing for unlinked sources or disabled channels", () => {
    expect(linkTargets(cells, 4, groups(), 2, { symbol: "TSLA" }, vals)).toEqual([]);
    expect(linkTargets(cells, 4, groups(), 0, { interval: "15m" }, vals)).toEqual([]);
    expect(linkTargets(cells, 4, groups({ symbol: false }), 0, { symbol: "TSLA" }, vals)).toEqual([]);
  });

  it("links the interval when the group enables it", () => {
    const t = linkTargets(cells, 4, groups({ interval: true }), 0, { symbol: "TSLA", interval: "15m" }, vals);
    expect(t).toEqual([{ index: 1, patch: { symbol: "TSLA", interval: "15m" } }]);
  });

  it("is idempotent: applying the targets and propagating again yields nothing (no loops)", () => {
    const g = groups({ interval: true });
    const t = linkTargets(cells, 4, g, 0, { symbol: "TSLA", interval: "15m" }, vals);
    const next = vals.map((v, i) => ({ ...v, ...(t.find((x) => x.index === i)?.patch ?? {}) }));
    next[0] = { symbol: "TSLA", interval: "15m" };
    // The linked cell "changed" too; propagating from it reaches the source with equal values.
    expect(linkTargets(cells, 4, g, 1, changeOf(vals[1], next[1]), next)).toEqual([]);
  });

  it("joining a group adopts the group's symbol", () => {
    expect(joinPatch(cells, 4, groups(), 2, "red", vals)).toEqual({ symbol: "AAPL" });
    expect(joinPatch(cells, 4, groups({ interval: true }), 2, "red", vals)).toEqual({ symbol: "AAPL" });
    expect(joinPatch(cells, 4, groups(), 2, "green", vals)).toEqual({});
  });

  it("crosshair targets: the group when linked, else the whole tab", () => {
    expect(crosshairTargets(cells, 4, 0)).toEqual([1]);
    expect(crosshairTargets(cells, 4, 2)).toEqual([0, 1, 3]);
    expect(crosshairTargets(cells, 4, 3)).toEqual([]);
  });

  it("time targets need the group's time toggle", () => {
    expect(timeTargets(cells, 4, groups(), 0)).toEqual([]);
    expect(timeTargets(cells, 4, groups({ time: true }), 0)).toEqual([1]);
  });
});
