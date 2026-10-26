import { describe, expect, it } from "vitest";
import type { Alert } from "@qt/core";
import { getIndicator } from "@qt/core";
import {
  buildAlert, cloneDraft, describeCondition, draftFromAlert, draftFromChart, emptyOperand, formatAlertTime, indicatorOperand, newCondition, newDraft, renderMessage,
} from "../src/panels/alerts/alertModel";
import { soundAllowed, STARTUP_MUTE_MS } from "../src/panels/alerts/sounds";

const NOW = Date.UTC(2026, 9, 13, 12, 0, 0);

describe("alert condition builder -> Alert JSON", () => {
  it("builds a simple price-crossing-value alert", () => {
    const d = newDraft("AAPL", "1h", 187.25);
    const { alert, errors } = buildAlert(d, NOW);
    expect(errors).toEqual([]);
    expect(alert).toEqual({
      name: "",
      symbol: "AAPL",
      interval: "1h",
      conditions: [{ left: { kind: "price" }, op: "crosses", right: { kind: "value", value: 187.25 } }],
      trigger: "once",
      active: true,
      message: "{{symbol}} alert at {{price}} ({{time}})",
      notify: { browser: true, sound: "chime" },
    });
  });

  it("ANDs several conditions with indicator operands, price fields and moving-%", () => {
    const d = newDraft("MSFT", "1D");
    const rsi = indicatorOperand(getIndicator("rsi")!);
    d.conditions = [
      { left: { ...emptyOperand("price"), field: "high" }, op: "greater", right: { ...emptyOperand("value"), value: "1,5" }, pct: "", bars: "1" },
      { left: rsi, op: "less", right: { ...emptyOperand("value"), value: "30" }, pct: "", bars: "1" },
      { left: emptyOperand("price"), op: "moving-up-pct", right: emptyOperand("value"), pct: "2.5", bars: "3" },
    ];
    d.trigger = "once-per-bar-close";
    d.webhookUrl = " https://example.test/hook ";
    d.sound = "";
    d.expires = "2030-01-01T10:00";
    const { alert, errors } = buildAlert(d, NOW);
    expect(errors).toEqual([]);
    expect(alert!.conditions).toEqual([
      { left: { kind: "price", field: "high" }, op: "greater", right: { kind: "value", value: 1.5 } },
      { left: { kind: "indicator", indicatorId: "rsi", inputs: rsi.inputs, output: "rsi" }, op: "less", right: { kind: "value", value: 30 } },
      { left: { kind: "price" }, op: "moving-up-pct", right: { kind: "value", value: 0 }, pct: 2.5, bars: 3 },
    ]);
    expect(alert!.notify).toEqual({ browser: true, webhookUrl: "https://example.test/hook" });
    expect(alert!.expiresAt).toBe(new Date("2030-01-01T10:00").getTime());
    expect(alert!.trigger).toBe("once-per-bar-close");
  });

  it("reports what must be fixed", () => {
    const d = newDraft(" ", "1D");
    d.conditions = [
      { left: emptyOperand("drawing"), op: "enters-channel", right: emptyOperand("value"), pct: "", bars: "1" },
      { ...newCondition(), op: "moving-down-pct", pct: "-1", bars: "0" },
    ];
    d.expires = "2001-01-01T00:00";
    d.webhookUrl = "ftp://x";
    const { alert, errors } = buildAlert(d, NOW);
    expect(alert).toBeNull();
    expect(errors.join("\n")).toMatch(/Symbol is required/);
    expect(errors.join("\n")).toMatch(/drawing can only be on the right/);
    expect(errors.join("\n")).toMatch(/channel operators need a channel/);
    expect(errors.join("\n")).toMatch(/percent must be a positive number/);
    expect(errors.join("\n")).toMatch(/bars must be a whole number/);
    expect(errors.join("\n")).toMatch(/Expiry must be in the future/);
    expect(errors.join("\n")).toMatch(/Webhook URL/);
  });

  it("round-trips an existing alert through the draft", () => {
    const a: Alert = {
      id: "a1",
      name: "Breakout",
      symbol: "BINANCE:BTCUSDT",
      interval: "4h",
      conditions: [
        { left: { kind: "indicator", indicatorId: "ema", inputs: { length: 21, source: "close" }, output: "ema" }, op: "crosses-up", right: { kind: "drawing", drawingId: "d1" } },
        { left: { kind: "price", field: "low" }, op: "moving-down-pct", right: { kind: "value", value: 0 }, pct: 3, bars: 2 },
      ],
      trigger: "every-time",
      active: false,
      message: "m",
      notify: { browser: false, sound: "ping", webhookUrl: "https://h.test/x" },
      createdAt: 1,
      layoutId: "default",
      expiresAt: Date.UTC(2031, 0, 1, 9, 30),
    };
    const d = draftFromAlert(a);
    expect(d.id).toBe("a1");
    const { alert, errors } = buildAlert(d, NOW);
    expect(errors).toEqual([]);
    const { id: _i, createdAt: _c, ...rest } = a;
    expect(alert).toEqual(rest);
    const c = cloneDraft(a);
    expect(c.id).toBeUndefined();
    expect(c.name).toBe("Breakout (copy)");
  });

  it("builds chart presets for a price and a drawing", () => {
    const p = buildAlert(draftFromChart("AAPL", "15m", 190.5), NOW).alert!;
    expect(p.conditions[0]).toEqual({ left: { kind: "price" }, op: "crosses", right: { kind: "value", value: 190.5 } });
    expect(p.name).toBe("AAPL crossing 190.50");
    const ch = buildAlert(draftFromChart("AAPL", "15m", { drawingId: "dr7", layoutId: "lay1", type: "channel" }), NOW).alert!;
    expect(ch.layoutId).toBe("lay1");
    expect(ch.conditions[0]).toEqual({ left: { kind: "price" }, op: "enters-channel", right: { kind: "drawing", drawingId: "dr7" } });
    const tl = buildAlert(draftFromChart("AAPL", "15m", { drawingId: "dr8", layoutId: "lay1", type: "trendline" }), NOW).alert!;
    expect(tl.conditions[0].op).toBe("crosses");
  });

  it("describes conditions for the list", () => {
    expect(describeCondition({ left: { kind: "price" }, op: "crosses-up", right: { kind: "value", value: 100 } })).toBe("price crossing up 100.00");
    expect(describeCondition({ left: { kind: "price" }, op: "moving-up-pct", right: { kind: "value", value: 0 }, pct: 2, bars: 3 })).toBe("price Moving up % 2% in 3 bars");
  });
});

describe("alert message templating", () => {
  it("fills symbol, price, time, name and interval", () => {
    const t = Date.UTC(2026, 9, 13, 7, 5, 9);
    expect(formatAlertTime(t)).toBe("2026-10-13 07:05:09 UTC");
    expect(renderMessage("{{symbol}} hit {{price}} at {{time}} [{{name}}/{{interval}}]", { symbol: "AAPL", price: 187.256, time: t, name: "Top", interval: "1h" })).toBe(
      "AAPL hit 187.26 at 2026-10-13 07:05:09 UTC [Top/1h]",
    );
  });

  it("tolerates spaces, repeats and leaves unknown placeholders", () => {
    expect(renderMessage("{{ symbol }} {{symbol}} {{unknown}} {{price}}", { symbol: "EURUSD=X", price: 1.08765, time: 0 })).toBe("EURUSD=X EURUSD=X {{unknown}} 1.0877");
  });
});

describe("alert sounds", () => {
  it("stay silent for 30 s after load and while muted", () => {
    expect(soundAllowed(1000 + STARTUP_MUTE_MS - 1, 1000, false)).toBe(false);
    expect(soundAllowed(1000 + STARTUP_MUTE_MS, 1000, false)).toBe(true);
    expect(soundAllowed(1000 + STARTUP_MUTE_MS * 2, 1000, true)).toBe(false);
  });
});
