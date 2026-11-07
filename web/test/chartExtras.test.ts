import { describe, expect, it } from "vitest";
import { barCountdown, barEnd, formatRemaining } from "../src/chart/countdown";
import { intervalText, watermarkText } from "../src/chart/renderers/watermark";
import { matchShortcut } from "../src/state/shortcuts";

describe("countdown to bar close", () => {
  it("formats the remaining time in the shortest readable form", () => {
    expect(formatRemaining(5)).toBe("00:05");
    expect(formatRemaining(245)).toBe("04:05");
    expect(formatRemaining(3845)).toBe("1:04:05");
    expect(formatRemaining(3 * 86400 + 4 * 3600 + 59)).toBe("3d 04h");
    expect(formatRemaining(-3)).toBe("00:00");
  });

  it("counts down to the end of the forming bar, and hides once that bar has closed", () => {
    expect(barCountdown(1000, 300, 1000 + 55)).toBe("04:05");
    expect(barCountdown(1000, 300, 1300)).toBeNull(); // closed: no newer bar yet (market closed)
    expect(barCountdown(1000, 300, 900)).toBeNull(); // clock behind the data
    expect(barCountdown(undefined, 300, 0)).toBeNull();
  });

  it("ends monthly bars at the next calendar month", () => {
    const feb = Date.UTC(2026, 1, 1) / 1000;
    expect(barEnd(feb, 30 * 86400, true)).toBe(Date.UTC(2026, 2, 1) / 1000);
    expect(barCountdown(feb, 30 * 86400, Date.UTC(2026, 1, 27) / 1000, true)).toBe("2d 00h");
  });
});

describe("symbol watermark", () => {
  it("shows the symbol without its source prefix and the interval", () => {
    expect(watermarkText("MT5:EURUSD", 3600)).toBe("EURUSD, 1h");
    expect(watermarkText("AAPL", 86400)).toBe("AAPL, 1D");
    expect(watermarkText("X", 30 * 86400, true)).toBe("X, 1M");
    expect(watermarkText("", 60)).toBe("");
    expect([60, 900, 7200, 604800, 30].map((s) => intervalText(s))).toEqual(["1m", "15m", "2h", "1W", "30s"]);
  });
});

describe("full screen shortcut", () => {
  it("is Alt+Shift+F", () => {
    expect(matchShortcut({ key: "F", code: "KeyF", altKey: true, shiftKey: true, ctrlKey: false, metaKey: false })).toEqual({ id: "fullscreen" });
    expect(matchShortcut({ key: "F", code: "KeyF", altKey: false, shiftKey: true, ctrlKey: false, metaKey: false })).toBeNull();
  });
});
