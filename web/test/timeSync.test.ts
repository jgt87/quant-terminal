import { describe, expect, it } from "vitest";
import { timeTargets } from "../src/state/links";
import { defaultWorkspace, normalizeWorkspace, workspaceReducer, type WsState } from "../src/state/workspace";
import type { LinkGroup } from "@qt/core";

const groups: LinkGroup[] = [{ color: "red", symbol: true, interval: false, time: false }];

describe("time sync", () => {
  it("targets every other cell when on, only a time-linked group otherwise", () => {
    const cells = [{ layoutId: "a", link: "red" as const }, { layoutId: "b" }, { layoutId: "c", link: "red" as const }, { layoutId: "d" }];
    expect(timeTargets(cells, 3, groups, 0, true)).toEqual([1, 2]);
    expect(timeTargets(cells, 4, groups, 1, true)).toEqual([0, 2, 3]);
    expect(timeTargets(cells, 4, groups, 0)).toEqual([]);
    expect(timeTargets(cells, 4, [{ ...groups[0], time: true }], 0)).toEqual([2]);
  });

  it("is a workspace toggle that is stored only when on", () => {
    const s: WsState = { ws: defaultWorkspace(1), closed: [] };
    const on = workspaceReducer(s, { type: "timeSync", on: true });
    expect(on.ws.timeSync).toBe(true);
    expect(workspaceReducer(on, { type: "timeSync", on: true })).toBe(on);
    const off = workspaceReducer(on, { type: "timeSync", on: false });
    expect("timeSync" in off.ws).toBe(false);
    expect(normalizeWorkspace({ ...on.ws }).timeSync).toBe(true);
    expect(normalizeWorkspace({ ...off.ws }).timeSync).toBeUndefined();
  });
});
