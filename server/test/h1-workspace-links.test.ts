import { describe, expect, it } from "vitest";
import { sanitizeLinkValues, validateWorkspace } from "../src/workspace/routes";

describe("workspace link values", () => {
  it("are kept when valid and dropped when malformed", () => {
    const body = { tabs: [{ id: "t", name: "T", grid: "1", cells: [{ layoutId: "l", link: "red" }] }], activeTab: "t" };
    const ws = validateWorkspace({ ...body, linkValues: { red: { symbol: "NVDA", symbolAt: 5 }, blue: { interval: "1h", intervalAt: 6, customInterval: "2h" } } }, 1);
    expect(ws.linkValues).toEqual({ red: { symbol: "NVDA", symbolAt: 5 }, blue: { interval: "1h", intervalAt: 6, customInterval: "2h" } });
    expect(validateWorkspace(body, 1).linkValues).toBeUndefined();
    expect(sanitizeLinkValues({ red: { symbol: "X" }, green: { interval: "2h", intervalAt: 1 } })).toBeUndefined();
  });
});
