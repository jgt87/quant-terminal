import { describe, expect, it } from "vitest";
import { REPLAY_OFF, replayClock, upToClock, type ReplayState } from "../src/chart/replay";
import { frameBook } from "../src/panels/dom/domModel";

const on = (cursor: number): ReplayState => ({ phase: "on", cursor, playing: false, speed: 1 });

describe("depth replay", () => {
  it("puts the replay clock at the end of the revealed bar, or at the last tick shown", () => {
    const times = [0, 60, 120];
    expect(replayClock(REPLAY_OFF, times, 60)).toBeNull();
    expect(replayClock(on(60), times, 60)).toBe(120_000);
    expect(replayClock(on(120), times, 60)).toBe(180_000);
    expect(replayClock(on(60), times, 60, 1_700_000_075_500)).toBe(1_700_000_075_500);
    expect(replayClock(on(60), times, 60, 1_700_000_075)).toBe(1_700_000_075_000);
  });

  it("keeps only the frames up to the clock", () => {
    const f = [1, 2, 3, 4].map((t) => ({ time: t * 1000 }));
    expect(upToClock(f, null)).toHaveLength(4);
    expect(upToClock(f, 2500).map((x) => x.time)).toEqual([1000, 2000]);
    expect(upToClock(f, 0)).toEqual([]);
  });

  it("turns a recorded frame into a book split at the best bid / ask", () => {
    const b = frameBook({ time: 5, step: 1, base: 100, qty: [1, 2, 0, 0, 3, 4], bid: 101.5, ask: 103.2 }, "S")!;
    expect(b.mode).toBe("replay");
    expect(b.bids).toEqual([[101, 2], [100, 1]]);
    expect(b.asks).toEqual([[104, 3], [105, 4]]);
    expect(frameBook(undefined, "S")).toBeNull();
  });
});
