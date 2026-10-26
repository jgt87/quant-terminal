import { describe, expect, it } from "vitest";
import type { CorporateEvent } from "@qt/core";
import { placeEventMarkers } from "../src/chart/events";
import { foldMarkers } from "../src/chart/renderers/marks";

const DAY = 86400;
const T0 = 1_704_067_200;

describe("event badges on transformed chart types", () => {
  it("map to the element completed in or after the event's source bar", () => {
    // Renko-like: elements completed by source bars on days 0, 0, 3, 7 (two bricks on day 0).
    const sourceTimes = [T0, T0, T0 + 3 * DAY, T0 + 7 * DAY];
    const events: CorporateEvent[] = [
      { time: T0, kind: "dividend", value: 0.2 },
      { time: T0 + 1 * DAY, kind: "split", value: "2:1" },
      { time: T0 + 3 * DAY, kind: "earnings", value: "" },
      { time: T0 + 20 * DAY, kind: "dividend", value: 0.2 },
    ];
    const m = placeEventMarkers(events, sourceTimes, DAY);
    expect(m.map((x) => [x.index, x.label])).toEqual([
      [1, "D"],
      [2, "SE"],
    ]);
  });

  it("folded badges keep every event for the tooltip", () => {
    const a = { index: 1, label: "D", kinds: ["dividend" as const], events: [{ time: 1, kind: "dividend" as const, value: 1 }] };
    const b = { index: 2, label: "S", kinds: ["split" as const], events: [{ time: 2, kind: "split" as const, value: "2:1" }] };
    const f = foldMarkers([a, b]);
    expect(f.label).toBe("+2");
    expect(f.kinds).toEqual(["dividend", "split"]);
    expect(f.events).toHaveLength(2);
  });
});
