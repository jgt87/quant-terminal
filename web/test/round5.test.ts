import { describe, expect, it } from "vitest";
import { MAX_TAPE_SYMBOLS, tapeSymbols } from "../src/components/TickerTape";
import { parseQty } from "../src/components/QuickTrade";
import { chartMenu, type ChartMenuActions } from "../src/state/menus";
import { fillsOf } from "../src/panels/paper/JournalView";
import type { PaperOrderView } from "../src/api/paper";

describe("ticker tape", () => {
  it("takes the first watchlist's symbols once, capped", () => {
    expect(tapeSymbols([{ symbols: ["AAPL", " MSFT ", "", "AAPL"] }, { symbols: ["X"] }])).toEqual(["AAPL", "MSFT"]);
    expect(tapeSymbols([])).toEqual([]);
    expect(tapeSymbols([{ symbols: Array.from({ length: 60 }, (_, i) => `S${i}`) }])).toHaveLength(MAX_TAPE_SYMBOLS);
  });
});

describe("one-click trading", () => {
  it("reads the quantity field", () => {
    expect(parseQty("2")).toBe(2);
    expect(parseQty("0,5")).toBe(0.5);
    expect(parseQty("0")).toBeNull();
    expect(parseQty("abc")).toBeNull();
  });

  it("offers the buy / sell buttons toggle in the chart menu", () => {
    let on: boolean | null = null;
    const base = { chartType: "candles", logScale: false, drawingCount: 0, hiddenDrawings: 0, indicatorCount: 0, priceText: "1" } as const;
    const acts = { resetView() {}, copy() {}, setChartType() {}, setLog() {}, removeDrawings() {}, showHiddenDrawings() {}, removeIndicators() {}, openChartSettings() {}, setBuySellButtons: (v: boolean) => (on = v) } as ChartMenuActions;
    const item = chartMenu({ ...base, buySellButtons: false }, acts).find((i) => "label" in i && i.label === "Buy / sell buttons (paper)");
    expect(item && "checked" in item ? item.checked : undefined).toBe(false);
    if (item && "onSelect" in item) item.onSelect?.();
    expect(on).toBe(true);
  });
});

describe("journal fills", () => {
  it("uses only filled orders with a fill price", () => {
    const o = (x: Partial<PaperOrderView>): PaperOrderView => ({ id: "a", symbol: "A", side: "buy", type: "market", qty: 1, status: "filled", createdAt: 1, ...x });
    const out = fillsOf([o({ id: "a", fillPrice: 10, filledAt: 5, realizedPnl: 0 }), o({ id: "b", status: "cancelled" }), o({ id: "c", fillPrice: undefined, filledAt: 3 })]);
    expect(out).toEqual([{ id: "a", symbol: "A", side: "buy", qty: 1, fillPrice: 10, filledAt: 5, realizedPnl: 0, commission: undefined }]);
  });
});
