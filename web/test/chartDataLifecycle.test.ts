import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Bar, SymbolInfo } from "@qt/core";
import type { ChartEngine } from "../src/chart/ChartEngine";

const mocks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[], setState: vi.fn(), load: vi.fn(), older: vi.fn(), subscribe: vi.fn() }));
vi.mock("react", () => ({ useEffect: (effect: () => void | (() => void)) => mocks.effects.push(effect), useState: (value: unknown) => [value, mocks.setState] }));
vi.mock("../src/api/liveFeed", () => ({ barPoller: { subscribe: mocks.subscribe } }));
vi.mock("../src/data/seriesSource", () => ({ SeriesSource: class {
  seconds = 60;
  provider = "1m";
  isFormula = false;
  isResampled = false;
  plan = { legs: ["AAA"] };
  load = mocks.load;
  older = mocks.older;
  bars = () => [];
} }));
import { useChartData } from "../src/hooks/useChartData";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const bar: Bar = { time: 1, open: 1, high: 1, low: 1, close: 1, volume: 1 };
const info: SymbolInfo = { symbol: "AAA", name: "AAA", exchange: "", type: "stock", currency: "USD", provider: "yahoo" };
const loaded = { bars: [bar], info, hasMore: true };
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));

function start() {
  let history: (() => void) | undefined;
  const engine = {
    meta: { symbol: "AAA" }, raw: { times: [1] }, root: { dataset: {} },
    clearData: vi.fn(), setData: vi.fn(), prependBars: vi.fn(), historyDone: vi.fn(),
    events: { on: vi.fn((_name: string, callback: () => void) => { history = callback; return vi.fn(); }) },
  };
  useChartData(engine as unknown as ChartEngine, "AAA", "1m");
  const cleanup = mocks.effects.pop()!() as () => void;
  return { engine, cleanup, history: () => history!() };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.effects.length = 0;
  mocks.subscribe.mockReturnValue(vi.fn());
  vi.stubGlobal("window", { setTimeout: vi.fn(), clearTimeout: vi.fn() });
});
afterEach(() => vi.unstubAllGlobals());

describe("chart series lifecycle", () => {
  it.each([loaded, { ...loaded, bars: [] }])("ignores a canceled initial load, including empty results", async (result) => {
    const pending = deferred<typeof loaded>();
    mocks.load.mockReturnValue(pending.promise);
    const { engine, cleanup } = start();
    cleanup();
    mocks.setState.mockClear();
    pending.resolve(result);
    await settle();
    expect(engine.setData).not.toHaveBeenCalled();
    expect(engine.clearData).not.toHaveBeenCalled();
    expect(mocks.setState).not.toHaveBeenCalled();
    expect(mocks.subscribe).not.toHaveBeenCalled();
  });

  it("ignores a non-abort error from a canceled load", async () => {
    const pending = deferred<typeof loaded>();
    mocks.load.mockReturnValue(pending.promise);
    const { engine, cleanup } = start();
    cleanup();
    mocks.setState.mockClear();
    pending.reject(new Error("late network failure"));
    await settle();
    expect(engine.clearData).not.toHaveBeenCalled();
    expect(mocks.setState).not.toHaveBeenCalled();
  });

  it("still applies the current result and starts polling", async () => {
    mocks.load.mockResolvedValue(loaded);
    const { engine, cleanup } = start();
    await settle();
    expect(engine.setData).toHaveBeenCalledWith(loaded.bars, expect.objectContaining({ symbol: "AAA" }));
    expect(mocks.subscribe).toHaveBeenCalledOnce();
    cleanup();
  });

  it("still displays a current load error", async () => {
    mocks.load.mockRejectedValue(new Error("current network failure"));
    const { engine, cleanup } = start();
    await settle();
    expect(engine.clearData).toHaveBeenCalledWith("current network failure");
    expect(mocks.setState).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it("does not schedule an old history retry after cleanup", async () => {
    mocks.load.mockResolvedValue(loaded);
    const pending = deferred<{ bars: Bar[]; hasMore: boolean }>();
    mocks.older.mockReturnValue(pending.promise);
    const { engine, cleanup, history } = start();
    await settle();
    history();
    cleanup();
    mocks.setState.mockClear();
    pending.reject(new Error("late history failure"));
    await settle();
    expect(window.setTimeout).not.toHaveBeenCalled();
    expect(engine.historyDone).not.toHaveBeenCalled();
    expect(mocks.setState).not.toHaveBeenCalled();
  });

  it("keeps an already queued retry from affecting the next series", async () => {
    mocks.load.mockResolvedValue(loaded);
    mocks.older.mockRejectedValue(new Error("history failure"));
    const { engine, cleanup, history } = start();
    await settle();
    history();
    await settle();
    const retry = vi.mocked(window.setTimeout).mock.calls[0][0] as () => void;
    cleanup();
    retry();
    expect(engine.historyDone).not.toHaveBeenCalled();
  });
});
