import { describe, expect, it } from "vitest";
import type { Layout } from "@qt/core";
import { parseTabFile, tabFileName, tabToFile } from "../src/state/tabFile";
import type { TabState } from "../src/state/workspace";

const layout = (id: string, symbol: string): Layout => ({ id, symbol, interval: "1D", chartType: "candles", logScale: false, indicators: [], drawings: {} }) as unknown as Layout;
const tab: TabState = { id: "t1", name: "Swing / daily", grid: "2h", cells: [{ layoutId: "a", link: "red" }, { layoutId: "b" }], sizes: [0.6, 0.4, 1], activeCell: 1 };

describe("chart tab files", () => {
  it("round-trips a tab with new ids, keeping grid, sizes, links and the charts", () => {
    const file = tabToFile(tab, [layout("a", "AAPL"), layout("b", "MSFT")], Date.UTC(2026, 10, 7));
    expect(file.exportedAt).toBe("2026-11-07T00:00:00.000Z");
    let n = 0;
    const out = parseTabFile(JSON.stringify(file), "t9", () => `c${++n}`, 5);
    expect(out.tab).toEqual({ id: "t9", name: "Swing / daily", grid: "2h", cells: [{ layoutId: "c1", link: "red" }, { layoutId: "c2" }], sizes: [0.6, 0.4, 1], activeCell: 0 });
    expect(out.layouts.map((l) => [l.id, l.symbol, l.updatedAt])).toEqual([["c1", "AAPL", 5], ["c2", "MSFT", 5]]);
  });

  it("refuses files that are not a usable tab", () => {
    const ok = tabToFile(tab, [layout("a", "AAPL"), layout("b", "MSFT")]);
    const parse = (v: unknown) => () => parseTabFile(typeof v === "string" ? v : JSON.stringify(v), "t", () => "c");
    expect(parse("{nope")).toThrow(/not valid JSON/);
    expect(parse({ kind: "other" })).toThrow(/not an exported chart tab/);
    expect(parse({ ...ok, version: 99 })).toThrow(/newer version/);
    expect(parse({ ...ok, tab: { ...ok.tab, grid: "7" } })).toThrow(/unknown grid/);
    expect(parse({ ...ok, tab: { ...ok.tab, cells: ok.tab.cells.slice(1) } })).toThrow(/needs 2 charts, the file has 1/);
    expect(parse({ ...ok, tab: { ...ok.tab, cells: [ok.tab.cells[0], { layout: { symbol: 1 } }] } })).toThrow(/Chart 2/);
  });

  it("names the file after the tab", () => {
    expect(tabFileName("Swing / daily", Date.UTC(2026, 10, 7))).toBe("Swing-daily-2026-11-07.tab.json");
    expect(tabFileName("///", Date.UTC(2026, 10, 7))).toBe("chart-tab-2026-11-07.tab.json");
  });
});
