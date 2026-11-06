import { describe, expect, it } from "vitest";
import { formingBar, REPLAY_OFF, replayReducer, tickStep } from "../src/chart/replay";

const ticks = [
  { time: 1000, price: 10, qty: 1 },
  { time: 2000, price: 12, qty: 2 },
  { time: 3000, price: 9, qty: 1 },
  { time: 4000, price: 11, qty: 3 },
];

describe("tick replay", () => {
  it("forms a bar from the first ticks", () => {
    expect(formingBar(ticks, 0, 60)).toBeNull();
    expect(formingBar(ticks, 2, 60)).toEqual({ time: 60, open: 10, high: 12, low: 10, close: 12, volume: 3 });
    expect(formingBar(ticks, 99, 60)).toEqual({ time: 60, open: 10, high: 12, low: 9, close: 11, volume: 7 });
  });

  it("plays a bar in about two seconds at 1x and faster at higher speeds", () => {
    expect(tickStep(4000, 1)).toBe(100); // 40 frames
    expect(tickStep(4000, 10)).toBe(1000); // 4 frames
    expect(tickStep(3, 1)).toBe(1);
  });

  it("tick mode is a replay option that survives exit", () => {
    const on = replayReducer({ ...REPLAY_OFF, phase: "on", cursor: 5 }, { type: "ticks", on: true });
    expect(on.ticks).toBe(true);
    expect(replayReducer(on, { type: "ticks", on: true })).toBe(on);
    expect(replayReducer(on, { type: "exit" })).toMatchObject({ phase: "off", ticks: true });
  });
});
