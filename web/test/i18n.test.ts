import { afterEach, describe, expect, it } from "vitest";
import panels from "../src/panels/panels.json";
import chartTypes from "../src/config/chartTypes.json";
import nl from "../src/i18n/nl.json";
import { getLanguage, LANGUAGES, missingTranslations, t, useLanguageForTests } from "../src/i18n";
import { chartMenu, priceAxisMenu, type ChartMenuActions, type PriceAxisActions } from "../src/state/menus";

type Item = { label?: string; submenu?: Item[]; type?: string };

/** Every static label of a menu tree (labels with values in them are left out). */
function labels(items: Item[]): string[] {
  const out: string[] = [];
  for (const m of items) {
    if (m.label && !/\d|BINANCE|AAPL|\{/.test(m.label)) out.push(m.label);
    if (m.submenu) out.push(...labels(m.submenu));
  }
  return out;
}

afterEach(() => useLanguageForTests("en"));

describe("translations", () => {
  it("falls back to English and fills placeholders", () => {
    expect(getLanguage()).toBe("en");
    expect(t("Chart settings")).toBe("Chart settings");
    expect(t("Theme: {current} (switch to {next})", { current: "Dark", next: "light" })).toBe("Theme: Dark (switch to light)");
    useLanguageForTests("nl");
    expect(t("Chart settings")).toBe("Grafiekinstellingen");
    expect(t("Theme: {current} (switch to {next})", { current: "Donker", next: "licht" })).toBe("Thema: Donker (wissel naar licht)");
    expect(t("Text without a translation")).toBe("Text without a translation");
    expect(LANGUAGES.map((l) => l.id)).toEqual(["en", "nl"]);
  });

  it("has no empty translations", () => {
    for (const [k, v] of Object.entries(nl)) expect(v.trim(), k).not.toBe("");
  });

  it("translates the chart menu, price axis menu, panel names and chart types", () => {
    const noop = () => {};
    const a = {
      resetView: noop, copy: noop, setChartType: noop, setLog: noop, removeDrawings: noop, showHiddenDrawings: noop, removeIndicators: noop, openChartSettings: noop,
      paste: noop, setHideAllDrawings: noop, setLockAllDrawings: noop, setSyncDrawings: noop, objectTree: noop, setOrderFlow: noop, timeAndSales: noop, depthLadder: noop,
      setDepthRecording: noop, setTimeZone: noop, exportCsv: noop, exportPng: noop, exportSvg: noop, dataTable: noop,
    } as unknown as ChartMenuActions;
    const chart = labels(chartMenu({ chartType: "candles", logScale: false, drawingCount: 1, hiddenDrawings: 0, indicatorCount: 1, priceText: "1", orderFlowAvailable: false }, a) as Item[]);
    // Named time zones are city names (kept as they are).
    const zoneCities = new Set(["New York", "Chicago", "Denver", "Los Angeles", "Toronto", "São Paulo", "London", "Amsterdam", "Berlin", "Paris", "Zurich", "Moscow", "Johannesburg", "Dubai", "Kolkata", "Singapore", "Hong Kong", "Shanghai", "Tokyo", "Seoul", "Sydney", "Auckland"]);
    const typeNames = new Set(["Renko", "Kagi", "Line Break", "Point & Figure", "Range bars"]);
    const missing = missingTranslations("nl", chart.filter((l) => !zoneCities.has(l) && !typeNames.has(l)));
    expect(missing).toEqual([]);
    const axis = labels(
      priceAxisMenu(
        { main: true, autoScale: true, log: false, percent: false, indexed: false, inverted: false, lastPriceLabel: true, maximized: false, collapsed: false },
        { setPlacement: noop } as unknown as PriceAxisActions,
      ) as Item[],
    );
    expect(missingTranslations("nl", axis)).toEqual([]);
    expect(missingTranslations("nl", (panels as { label: string }[]).map((p) => p.label))).toEqual([]);
    expect(missingTranslations("nl", chartTypes.map((c) => c.label).filter((l) => !typeNames.has(l)))).toEqual([]);
  });
});
