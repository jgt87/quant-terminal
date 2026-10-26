import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PRESETS, buildRequest, fieldTone, filtersToDrafts, formatField, newFilter, sanitizePresets, serializeFilters, upsertPreset, type FilterDraft,
} from "../src/panels/screener/screenerModel";
import { nextSort, sortBy } from "../src/panels/common/sort";

const f = (p: Partial<FilterDraft>): FilterDraft => ({ ...newFilter(), ...p });

describe("screener filter serialization", () => {
  it("serializes value, between and field-comparison filters", () => {
    const { filters, errors } = serializeFilters([
      f({ field: "rsi14", op: ">", value: "55" }),
      f({ field: "changePct", op: "between", value: "5", value2: "-2" }),
      f({ field: "close", op: "above-field", otherField: "sma200", value: "ignored" }),
      f({ field: "perf1M", op: "<=", value: "0,5" }),
    ]);
    expect(errors).toEqual([]);
    expect(filters).toEqual([
      { field: "rsi14", op: ">", value: 55 },
      { field: "changePct", op: "between", value: -2, value2: 5 },
      { field: "close", op: "above-field", otherField: "sma200" },
      { field: "perf1M", op: "<=", value: 0.5 },
    ]);
  });

  it("drops and reports incomplete rows", () => {
    const { filters, errors } = serializeFilters([f({ op: ">", value: "" }), f({ op: "between", value: "1" }), f({ field: "close", op: "below-field", otherField: "close" })]);
    expect(filters).toEqual([]);
    expect(errors).toHaveLength(3);
  });

  it("round-trips through drafts and builds the request with columns", () => {
    const filters = BUILT_IN_PRESETS[0].filters;
    expect(serializeFilters(filtersToDrafts(filters)).filters).toEqual(filters);
    const { req } = buildRequest("nasdaq100", filtersToDrafts([{ field: "relVolume", op: ">", value: 2 }]), ["close", "changePct"]);
    expect(req).toEqual({ universe: "nasdaq100", filters: [{ field: "relVolume", op: ">", value: 2 }], columns: ["close", "changePct", "relVolume"] });
    expect(buildRequest("custom", [], [], ["AAPL"]).req).toEqual({ universe: "custom", filters: [], symbols: ["AAPL"] });
  });

  it("keeps presets by name and sanitizes stored data", () => {
    const a = { name: "B", universe: "u", filters: [], columns: [] };
    const list = upsertPreset(upsertPreset([], a), { ...a, name: "A" });
    expect(list.map((p) => p.name)).toEqual(["A", "B"]);
    expect(upsertPreset(list, { ...a, universe: "v" }).find((p) => p.name === "B")!.universe).toBe("v");
    expect(sanitizePresets([a, { name: 1 }, null, "x"])).toEqual([a]);
    expect(sanitizePresets("nope")).toEqual([]);
  });

  it("formats and colors fields", () => {
    expect(formatField("changePct", 1.234)).toBe("+1.23%");
    expect(formatField("volume", 1_500_000)).toBe("1.50M");
    expect(formatField("rsi14", null)).toBe("—");
    expect(fieldTone("perf1W", -2)).toBe("neg");
    expect(fieldTone("rsi14", 70)).toBe("");
  });
});

describe("table sorting", () => {
  it("cycles desc -> asc -> off and keeps nulls last", () => {
    let s = nextSort(null, "v");
    expect(s).toEqual({ key: "v", dir: "desc" });
    const rows = [{ v: 1 }, { v: null }, { v: 3 }, { v: 2 }];
    expect(sortBy(rows, s, (r) => r.v).map((r) => r.v)).toEqual([3, 2, 1, null]);
    s = nextSort(s, "v");
    expect(sortBy(rows, s, (r) => r.v).map((r) => r.v)).toEqual([1, 2, 3, null]);
    expect(nextSort(s, "v")).toBeNull();
  });
});
