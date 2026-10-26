import { describe, expect, it } from "vitest";
import {
  adoptRemote,
  CLOSED_MAX,
  defaultWorkspace,
  makeTab,
  mergeWorkspaces,
  nextTabName,
  normalizeWorkspace,
  workspaceReducer,
  type WsAction,
  type WsState,
} from "../src/state/workspace";

const init = (): WsState => ({ ws: defaultWorkspace(1), closed: [] });
const run = (s: WsState, ...actions: WsAction[]) => actions.reduce(workspaceReducer, s);
const ids = (s: WsState) => s.ws.tabs.map((t) => t.id);

describe("workspace defaults", () => {
  it("a missing workspace is one tab, grid 1, bound to the default layout", () => {
    const w = normalizeWorkspace(null);
    expect(w.tabs).toHaveLength(1);
    expect(w.tabs[0].grid).toBe("1");
    expect(w.tabs[0].cells).toEqual([{ layoutId: "default" }]);
    expect(w.linkGroups).toHaveLength(9);
    expect(w.crosshairSync).toBe(false);
  });

  it("normalizes stored documents", () => {
    const w = normalizeWorkspace({
      tabs: [
        {
          id: "a",
          name: "A",
          grid: "4",
          cells: [{ layoutId: "l1", link: "red" }, { layoutId: "l2" }, { layoutId: "l3" }, { layoutId: "l4", link: "nope" }],
          activeCell: 3,
          sizes: [1, 1, 1, 3],
        },
        { id: "bad", grid: "4", cells: [{ layoutId: "x" }] },
        { id: "a", grid: "1", cells: [{ layoutId: "dup" }] },
      ],
      activeTab: "zzz",
      crosshairSync: true,
    });
    expect(w.tabs.map((t) => t.id)).toEqual(["a"]);
    expect(w.activeTab).toBe("a");
    expect(w.tabs[0].cells[3]).toEqual({ layoutId: "l4" });
    expect(w.tabs[0].activeCell).toBe(3);
    expect(w.tabs[0].sizes).toEqual([0.5, 0.5, 0.25, 0.75]);
    expect(w.crosshairSync).toBe(true);
  });
});

describe("tab reducer", () => {
  it("creates tabs after the active one and activates them", () => {
    const s = run(
      init(),
      { type: "new", tab: makeTab("t2", "Chart 2", "l2") },
      { type: "select", tabId: "t-default" },
      { type: "new", tab: makeTab("t3", "Chart 3", "l3") },
    );
    expect(ids(s)).toEqual(["t-default", "t3", "t2"]);
    expect(s.ws.activeTab).toBe("t3");
    expect(nextTabName(s.ws)).toBe("Chart 4");
  });

  it("closes tabs, activates the neighbour and reopens at the old position", () => {
    let s = run(
      init(),
      { type: "new", tab: makeTab("t2", "B", "l2") },
      { type: "new", tab: makeTab("t3", "C", "l3") },
      { type: "select", tabId: "t2" },
    );
    s = run(s, { type: "close", tabId: "t2" });
    expect(ids(s)).toEqual(["t-default", "t3"]);
    expect(s.ws.activeTab).toBe("t3");
    expect(s.closed).toHaveLength(1);
    s = run(s, { type: "reopen" });
    expect(ids(s)).toEqual(["t-default", "t2", "t3"]);
    expect(s.ws.activeTab).toBe("t2");
    expect(s.closed).toHaveLength(0);
    expect(run(s, { type: "reopen" })).toBe(s);
  });

  it("keeps at most 20 closed tabs, most recent last", () => {
    let s = init();
    for (let i = 0; i < 25; i++) s = run(s, { type: "new", tab: makeTab(`n${i}`, `N${i}`, `l${i}`) }, { type: "close", tabId: `n${i}` });
    expect(s.closed).toHaveLength(CLOSED_MAX);
    expect(s.closed[s.closed.length - 1].tab.id).toBe("n24");
    expect(s.closed[0].tab.id).toBe("n5");
  });

  it("the last tab only closes with a replacement", () => {
    const s = init();
    expect(run(s, { type: "close", tabId: "t-default" })).toBe(s);
    const r = run(s, { type: "close", tabId: "t-default", replacement: makeTab("fresh", "Chart 1", "lf") });
    expect(ids(r)).toEqual(["fresh"]);
    expect(r.ws.activeTab).toBe("fresh");
    expect(ids(run(r, { type: "reopen" }))).toEqual(["t-default", "fresh"]);
  });

  it("renames, ignoring blank names", () => {
    const s = run(init(), { type: "rename", tabId: "t-default", name: "  Majors " });
    expect(s.ws.tabs[0].name).toBe("Majors");
    expect(run(s, { type: "rename", tabId: "t-default", name: "  " })).toBe(s);
  });

  it("duplicates with new layout ids for every cell", () => {
    let s = run(
      init(),
      { type: "grid", tabId: "t-default", grid: "2h", newLayoutIds: ["l2"] },
      { type: "cellLink", tabId: "t-default", index: 1, link: "red" },
    );
    s = run(s, { type: "duplicate", tabId: "t-default", newTabId: "copy", layoutIds: ["c1", "c2"] });
    expect(ids(s)).toEqual(["t-default", "copy"]);
    const copy = s.ws.tabs[1];
    expect(copy.cells).toEqual([{ layoutId: "c1" }, { layoutId: "c2", link: "red" }]);
    expect(copy.grid).toBe("2h");
    expect(copy.name).toBe("Chart 1 copy");
    expect(s.ws.activeTab).toBe("copy");
    expect(run(s, { type: "duplicate", tabId: "t-default", newTabId: "x", layoutIds: ["only-one"] })).toBe(s);
  });

  it("reorders by drag", () => {
    const s = run(
      init(),
      { type: "new", tab: makeTab("b", "B", "lb") },
      { type: "new", tab: makeTab("c", "C", "lc") },
      { type: "move", from: 2, to: 0 },
    );
    expect(ids(s)).toEqual(["c", "t-default", "b"]);
  });

  it("cycles and jumps to tab N (9 = last)", () => {
    let s = run(init(), { type: "new", tab: makeTab("b", "B", "lb") }, { type: "new", tab: makeTab("c", "C", "lc") });
    expect(run(s, { type: "cycle", dir: 1 }).ws.activeTab).toBe("t-default");
    expect(run(s, { type: "cycle", dir: -1 }).ws.activeTab).toBe("b");
    s = run(s, { type: "selectIndex", index: 0 });
    expect(s.ws.activeTab).toBe("t-default");
    expect(run(s, { type: "selectIndex", index: 8 }).ws.activeTab).toBe("c");
  });

  it("changes the grid, adding cells and keeping extra cells for later", () => {
    let s = run(
      init(),
      { type: "grid", tabId: "t-default", grid: "4", newLayoutIds: ["a", "b", "c"] },
      { type: "activeCell", tabId: "t-default", index: 3 },
    );
    expect(s.ws.tabs[0].cells.map((c) => c.layoutId)).toEqual(["default", "a", "b", "c"]);
    expect(s.ws.tabs[0].activeCell).toBe(3);
    s = run(s, { type: "grid", tabId: "t-default", grid: "2h", newLayoutIds: [] });
    expect(s.ws.tabs[0].cells).toHaveLength(4);
    expect(s.ws.tabs[0].activeCell).toBe(1);
    expect(s.ws.tabs[0].sizes).toEqual([0.5, 0.5, 1]);
    // Not enough new ids: refused.
    expect(run(s, { type: "grid", tabId: "t-default", grid: "9", newLayoutIds: ["x"] })).toBe(s);
  });

  it("stores sizes, links, link groups and crosshair sync", () => {
    let s = run(init(), { type: "grid", tabId: "t-default", grid: "2h", newLayoutIds: ["b"] });
    s = run(s, { type: "sizes", tabId: "t-default", sizes: [0.7, 0.3, 1] });
    expect(s.ws.tabs[0].sizes).toEqual([0.7, 0.3, 1]);
    s = run(
      s,
      { type: "cellLink", tabId: "t-default", index: 0, link: "red" },
      { type: "cellLink", tabId: "t-default", index: 0, link: undefined },
    );
    expect(s.ws.tabs[0].cells[0]).toEqual({ layoutId: "default" });
    s = run(s, { type: "linkGroup", group: { color: "red", symbol: true, interval: true, time: true } }, { type: "crosshairSync", on: true });
    expect(s.ws.linkGroups.find((g) => g.color === "red")).toEqual({ color: "red", symbol: true, interval: true, time: true });
    expect(s.ws.linkGroups).toHaveLength(9);
    expect(s.ws.crosshairSync).toBe(true);
    expect(run(s, { type: "crosshairSync", on: true })).toBe(s);
  });

  it("binds a cell to another layout id", () => {
    const s = run(init(), { type: "cellLayout", tabId: "t-default", index: 0, layoutId: "e2e" });
    expect(s.ws.tabs[0].cells[0].layoutId).toBe("e2e");
    expect(run(s, { type: "cellLayout", tabId: "t-default", index: 0, layoutId: "../x" })).toBe(s);
  });
});

describe("sync helpers", () => {
  it("three-way merge keeps local changes and takes the rest from remote", () => {
    const base = defaultWorkspace(1);
    const local = { ...base, crosshairSync: true };
    const remote = { ...base, tabs: [...base.tabs, makeTab("r", "R", "lr")], updatedAt: 5 };
    const m = mergeWorkspaces(base, local, remote);
    expect(m.crosshairSync).toBe(true);
    expect(m.tabs.map((t) => t.id)).toEqual(["t-default", "r"]);
    expect(m.updatedAt).toBe(5);
  });

  it("adopting another browser tab's save keeps this tab's active tab and cells", () => {
    const b = { ...makeTab("b", "B", "lb"), grid: "2h" as const, cells: [{ layoutId: "lb" }, { layoutId: "lc" }], activeCell: 1 };
    const local = { ...defaultWorkspace(1), tabs: [makeTab("a", "A", "la"), b], activeTab: "b" };
    const remote = { ...local, tabs: [local.tabs[0], { ...b, activeCell: 0, name: "Renamed" }], activeTab: "a", updatedAt: 9 };
    const r = adoptRemote(local, remote);
    expect(r.activeTab).toBe("b");
    expect(r.tabs[1].activeCell).toBe(1);
    expect(r.tabs[1].name).toBe("Renamed");
  });
});
