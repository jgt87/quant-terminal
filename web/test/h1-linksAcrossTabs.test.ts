import { describe, expect, it } from "vitest";
import { crosshairTargets, defaultLinkGroups, mountPatch, normalizeLinkValues, recordLinkChange } from "../src/state/links";
import { defaultWorkspace, makeTab, mergeWorkspaces, normalizeWorkspace, workspaceReducer, type WsAction, type WsState } from "../src/state/workspace";

const red = (patch = {}) => ({ ...defaultLinkGroups()[0], ...patch });
const run = (s: WsState, ...actions: WsAction[]) => actions.reduce(workspaceReducer, s);

/** Two tabs, each with a red-linked cell. */
function twoTabs(): WsState {
  const ws = defaultWorkspace(1);
  const a = { ...makeTab("ta", "A", "la"), cells: [{ layoutId: "la", link: "red" as const }] };
  const b = { ...makeTab("tb", "B", "lb"), cells: [{ layoutId: "lb", link: "red" as const }] };
  return { ws: { ...ws, tabs: [a, b], activeTab: "ta" }, closed: [] };
}

describe("link groups across tabs", () => {
  it("records only the channels the group links", () => {
    expect(recordLinkChange(undefined, red(), { symbol: "TSLA", interval: "15m" }, 10)).toEqual({ red: { symbol: "TSLA", symbolAt: 10 } });
    const v = recordLinkChange(undefined, red({ interval: true }), { interval: "1h", customInterval: "2h" }, 20);
    expect(v).toEqual({ red: { interval: "1h", customInterval: "2h", intervalAt: 20 } });
    // A native interval clears the custom one.
    expect(recordLinkChange(v, red({ interval: true }), { interval: "4h" }, 30).red).toEqual({ interval: "4h", intervalAt: 30 });
  });

  it("the reducer stores the value; inactive-tab cells adopt it when they mount", () => {
    const s = run(twoTabs(), { type: "linkValue", color: "red", change: { symbol: "NVDA" }, at: 1000 });
    expect(s.ws.linkValues).toEqual({ red: { symbol: "NVDA", symbolAt: 1000 } });
    // Tab B's cell mounts with a layout saved before the change.
    const g = s.ws.linkGroups.find((x) => x.color === "red")!;
    expect(mountPatch(s.ws.linkValues!.red, g, { symbol: "AAPL", interval: "1D" }, 500)).toEqual({ symbol: "NVDA" });
    // A layout changed after the link value keeps its own symbol; equal values are a no-op.
    expect(mountPatch(s.ws.linkValues!.red, g, { symbol: "AAPL", interval: "1D" }, 2000)).toEqual({});
    expect(mountPatch(s.ws.linkValues!.red, g, { symbol: "NVDA", interval: "1D" }, 500)).toEqual({});
  });

  it("an unchanged or unlinked-channel change leaves the state untouched", () => {
    const s0 = twoTabs();
    expect(run(s0, { type: "linkValue", color: "red", change: { interval: "1h" }, at: 5 })).toBe(s0);
    const s1 = run(s0, { type: "linkValue", color: "red", change: { symbol: "X" }, at: 5 });
    expect(run(s1, { type: "linkValue", color: "red", change: { symbol: "X" }, at: 5 })).toBe(s1);
  });

  it("interval values apply only when the group links intervals", () => {
    const v = recordLinkChange(undefined, red({ interval: true }), { interval: "15m" }, 100).red;
    expect(mountPatch(v, red({ interval: true }), { symbol: "A", interval: "1D" }, 50)).toEqual({ interval: "15m" });
    expect(mountPatch(v, red(), { symbol: "A", interval: "1D" }, 50)).toEqual({});
  });

  it("survives normalize and the three-way merge; malformed entries are dropped", () => {
    const s = run(twoTabs(), { type: "linkValue", color: "red", change: { symbol: "NVDA" }, at: 1000 });
    expect(normalizeWorkspace(JSON.parse(JSON.stringify(s.ws))).linkValues).toEqual({ red: { symbol: "NVDA", symbolAt: 1000 } });
    expect(normalizeLinkValues({ red: { symbol: 5 }, nope: { symbol: "X", symbolAt: 1 }, blue: { interval: "7m", intervalAt: 1 } })).toBeUndefined();
    const base = twoTabs().ws;
    const remote = { ...base, crosshairSync: true };
    const merged = mergeWorkspaces(base, s.ws, remote);
    expect(merged.linkValues?.red?.symbol).toBe("NVDA");
    expect(merged.crosshairSync).toBe(true);
  });

  it("crosshair sync stays within the visible tab's cells", () => {
    const cells = [{ layoutId: "a", link: "red" as const }, { layoutId: "b", link: "red" as const }, { layoutId: "c", link: "red" as const }];
    // Only the visible cells of the tab (count 2) are targets.
    expect(crosshairTargets(cells, 2, 0)).toEqual([1]);
  });
});
