import { describe, expect, it } from "vitest";
import type { IndicatorInstance } from "@qt/core";
import { paneRoots } from "../src/chart/ChartEngine";
import { COLLAPSED_PANE_PX, layoutPanes, Pane, separatorAt } from "../src/chart/Pane";
import { PriceScale } from "../src/chart/PriceScale";
import { movedIndicators } from "../src/state/chartMenuFor";
import { indicatorMenu, priceAxisMenu } from "../src/state/menus";

const ind = (uid: string, indicatorId: string, extra: Partial<IndicatorInstance> = {}): IndicatorInstance => ({ uid, indicatorId, inputs: {}, visible: true, ...extra });
const PANES: Record<string, "overlay" | "separate"> = { rsi: "separate", macd: "separate", sma: "overlay", atr: "separate" };
const defPane = (id: string) => PANES[id];

describe("pane roots", () => {
  it("groups indicators that name another separate indicator, in any list order", () => {
    const r = paneRoots([{ uid: "b", paneWith: "a" }, { uid: "a" }, { uid: "c", paneWith: "b" }, { uid: "d" }]);
    expect(r.get("a")).toBe("a");
    expect(r.get("b")).toBe("a");
    expect(r.get("c")).toBe("a");
    expect(r.get("d")).toBe("d");
  });

  it("falls back to an own pane for a missing target and resolves cycles to one root", () => {
    const r = paneRoots([{ uid: "x", paneWith: "gone" }, { uid: "p", paneWith: "q" }, { uid: "q", paneWith: "p" }]);
    expect(r.get("x")).toBe("x");
    expect(r.get("p")).toBe(r.get("q"));
    const root = r.get("p")!;
    expect(r.get(root)).toBe(root);
  });
});

describe("moving indicators between panes", () => {
  const list = [ind("r", "rsi"), ind("m", "macd"), ind("s", "sma"), ind("a", "atr", { paneWith: "r" })];

  it("joins another pane, moves to the price pane and to a new pane", () => {
    const joined = movedIndicators(list, "m", { kind: "with", uid: "r" }, defPane);
    expect(joined.find((i) => i.uid === "m")).toMatchObject({ paneWith: "r", pane: undefined });
    const over = movedIndicators(list, "m", { kind: "overlay" }, defPane);
    expect(over.find((i) => i.uid === "m")).toMatchObject({ pane: "overlay", paneWith: undefined });
    const sma = movedIndicators(list, "s", { kind: "new" }, defPane);
    expect(sma.find((i) => i.uid === "s")).toMatchObject({ pane: "separate", paneWith: undefined });
    const smaJoin = movedIndicators(list, "s", { kind: "with", uid: "m" }, defPane);
    expect(smaJoin.find((i) => i.uid === "s")).toMatchObject({ pane: "separate", paneWith: "m" });
    const back = movedIndicators(sma, "s", { kind: "overlay" }, defPane);
    expect(back.find((i) => i.uid === "s")?.pane).toBeUndefined();
  });

  it("keeps the rest of a pane together when its host moves away", () => {
    const three = [...list, ind("m2", "macd", { paneWith: "r" })];
    const out = movedIndicators(three, "r", { kind: "overlay" }, defPane);
    expect(out.find((i) => i.uid === "a")?.paneWith).toBeUndefined();
    expect(out.find((i) => i.uid === "m2")?.paneWith).toBe("a");
    const roots = paneRoots(out.filter((i) => (i.pane ?? defPane(i.indicatorId)) === "separate"));
    expect(roots.get("m2")).toBe("a");
  });
});

describe("pane layout", () => {
  const make = () => [new Pane("main", true, 1), new Pane("p1", false, 0.3), new Pane("p2", false, 0.3)];

  it("gives a collapsed pane a fixed strip and the rest to the others", () => {
    const panes = make();
    panes[1].collapsed = true;
    layoutPanes(panes, 600, 1);
    expect(panes[1].height).toBe(COLLAPSED_PANE_PX);
    expect(panes[0].height + panes[1].height + panes[2].height + 2).toBe(600);
    expect(panes[2].top).toBe(panes[1].top + panes[1].height + 1);
    // Separators next to a collapsed pane cannot be dragged.
    expect(separatorAt(panes, panes[0].top + panes[0].height, 1)).toBe(-1);
  });

  it("hidden panes take no space while one pane is maximised", () => {
    const panes = make();
    panes[0].hidden = true;
    panes[2].hidden = true;
    layoutPanes(panes, 600, 1);
    expect(panes[1].top).toBe(0);
    expect(panes[1].height).toBe(600);
    expect(panes[0].height).toBe(0);
    expect(panes[0].contains(10)).toBe(false);
    expect(separatorAt(panes, 600, 1)).toBe(-1);
  });

  it("keeps the old proportional layout when nothing is collapsed", () => {
    const panes = make();
    layoutPanes(panes, 801, 1);
    expect(panes[0].height + panes[1].height + panes[2].height).toBe(799);
    expect(panes[0].height).toBeGreaterThan(panes[1].height * 2.5);
  });
});

describe("price scale modes", () => {
  const scale = () => {
    const ps = new PriceScale();
    ps.setHeight(500);
    ps.marginTop = ps.marginBottom = 0;
    ps.setRange(100, 200);
    return ps;
  };

  it("inverted puts high prices at the bottom and round-trips", () => {
    const ps = scale();
    ps.inverted = true;
    expect(ps.toY(200)).toBeCloseTo(500);
    expect(ps.toY(100)).toBeCloseTo(0);
    for (const p of [100, 133.3, 200]) expect(ps.fromY(ps.toY(p))).toBeCloseTo(p, 9);
    const ticks = ps.ticks();
    expect(ticks.length).toBeGreaterThan(2);
    expect(ticks[1].y).toBeGreaterThan(ticks[0].y);
  });

  it("inverted log ticks are still produced", () => {
    const ps = scale();
    ps.setLog(true);
    ps.setRange(10, 1000);
    ps.inverted = true;
    expect(ps.ticks().length).toBeGreaterThan(2);
  });

  it("indexed labels show the base as 100", () => {
    const ps = scale();
    ps.percentBase = 150;
    ps.indexed = true;
    expect(ps.format(150)).toBe("100.00");
    expect(ps.format(165)).toBe("110.00");
    const t = ps.ticks().find((k) => Math.abs(k.price - 150) < 1e-9);
    expect(t?.text.startsWith("100")).toBe(true);
    ps.indexed = false;
    expect(ps.format(165)).toBe("+10.00%");
  });
});

describe("menus", () => {
  it("indicator menu offers move targets, scale and pane size actions", () => {
    const calls: unknown[] = [];
    const items = indicatorMenu(
      ind("m", "macd"),
      "separate",
      {
        settings: () => {},
        toggleVisible: () => {},
        movePane: (to) => calls.push(to),
        setOwnScale: (on) => calls.push(on),
        toggleMaximized: () => calls.push("max"),
        toggleCollapsed: () => calls.push("col"),
        remove: () => {},
      },
      { panes: [{ uid: "r", label: "RSI", current: false }], ownScale: false, maximized: false, collapsed: false },
    );
    const move = items.find((i) => "label" in i && i.label === "Move to") as { submenu: { label?: string; onSelect?(): void }[] };
    move.submenu.find((i) => i.label === "RSI")!.onSelect!();
    expect(calls).toEqual([{ kind: "with", uid: "r" }]);
    expect(items.some((i) => "label" in i && i.label === "Collapse pane")).toBe(true);
  });

  it("price axis menu has indexed and inverted modes", () => {
    const labels = priceAxisMenu(
      { main: true, autoScale: true, log: false, percent: false, indexed: true, inverted: false, lastPriceLabel: true, maximized: false, collapsed: false },
      { setAuto() {}, setLog() {}, setPercent() {}, setIndexed() {}, setInverted() {}, reset() {}, setLastPriceLabel() {}, toggleMaximized() {}, toggleCollapsed() {} },
    ).flatMap((i) => ("label" in i ? [i.label] : []));
    expect(labels).toContain("Indexed to 100");
    expect(labels).toContain("Invert scale");
    expect(labels).not.toContain("Collapse pane");
  });
});
