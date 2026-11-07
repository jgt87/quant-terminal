// Top toolbar: symbol, intervals, chart type, scale/volume toggles, indicators, chart settings,
// chart grid and crosshair sync of the workspace, theme switch and panel toggles. Chart controls
// act on the active chart cell.

import type { ChartType, GridKind, Interval } from "@qt/core";
import { nextTheme, THEME_LABEL, type ThemeMode } from "../chart/theme";
import chartTypes from "../config/chartTypes.json";
import intervals from "../config/intervals.json";
import { CustomIntervalMenu } from "./CustomIntervalMenu";
import { Dropdown } from "./Dropdown";
import { Icon } from "./icons";
import { GridPicker } from "./workspace/GridPicker";
import "../styles/toolbar.css";

interface Props {
  symbol: string;
  interval: Interval;
  /** Custom interval of the active chart ("2h"), if any. */
  customInterval?: string;
  onCustomInterval?(spec: string): void;
  /** Compare symbols / Bar Replay on the active chart (optional for single-chart use). */
  onCompare?(): void;
  onReplay?(): void;
  replayActive?: boolean;
  chartType: ChartType;
  logScale: boolean;
  showVolume: boolean;
  watchlistOpen: boolean;
  backtestOpen: boolean;
  theme: ThemeMode;
  onSymbolClick(): void;
  onInterval(i: Interval): void;
  onChartType(t: ChartType): void;
  onLog(v: boolean): void;
  onVolume(v: boolean): void;
  onIndicators(): void;
  onResetView(): void;
  onChartSettings(): void;
  onTheme(): void;
  onToggleWatchlist(): void;
  /** Ticker tape of the first watchlist under the toolbar. */
  tickerTapeOpen?: boolean;
  onToggleTickerTape?(): void;
  onToggleBacktest(): void;
  /** Workspace: grid of the active tab and crosshair sync (optional for single-chart use). */
  grid?: GridKind;
  onGrid?(kind: GridKind): void;
  crosshairSync?: boolean;
  onCrosshairSync?(on: boolean): void;
  timeSync?: boolean;
  onTimeSync?(on: boolean): void;
  /** Full screen (the whole workspace, toolbars included). */
  fullscreen?: boolean;
  onFullscreen?(): void;
}

export function TopToolbar(p: Props) {
  return (
    <header className="top-toolbar">
      <span className="brand">Quant Terminal</span>
      <button className="tb-btn symbol-btn" title="Symbol search (or just start typing on the chart)" onClick={p.onSymbolClick}>
        <Icon name="search" size={14} />
        <span>{p.symbol}</span>
      </button>
      <span className="tb-sep" />
      <div className="tb-group" role="group" aria-label="Interval">
        {intervals.map((i) => (
          <button
            key={i.id}
            className={`tb-btn interval${p.interval === i.id && !p.customInterval ? " active" : ""}`}
            title={i.title}
            aria-pressed={p.interval === i.id && !p.customInterval}
            onClick={() => p.onInterval(i.id as Interval)}
          >
            {i.label}
          </button>
        ))}
        {p.onCustomInterval && <CustomIntervalMenu value={p.customInterval} onPick={p.onCustomInterval} />}
      </div>
      <span className="tb-sep" />
      <Dropdown
        value={p.chartType}
        options={chartTypes}
        onChange={(id) => p.onChartType(id as ChartType)}
        icon={<Icon name="candles" size={14} />}
        title="Chart type"
      />
      <button className="tb-btn" onClick={p.onIndicators} title="Add indicator" aria-label="Indicators">
        <Icon name="indicators" size={14} />
        <span className="tb-label">Indicators</span>
      </button>
      {p.onCompare && (
        <button className="tb-btn" onClick={p.onCompare} title="Compare symbols (percent overlays)" aria-label="Compare">
          <Icon name="compare" size={14} />
          <span className="tb-label">Compare</span>
        </button>
      )}
      {p.onReplay && (
        <button
          className={`tb-btn${p.replayActive ? " active" : ""}`}
          onClick={p.onReplay}
          aria-pressed={!!p.replayActive}
          title="Bar replay: pick a start bar, then play the chart forward"
          aria-label="Replay"
        >
          <Icon name="replay" size={14} />
          <span className="tb-label">Replay</span>
        </button>
      )}
      <span className="tb-sep" />
      <button className={`tb-btn${p.logScale ? " active" : ""}`} aria-pressed={p.logScale} onClick={() => p.onLog(!p.logScale)} title="Logarithmic price scale">
        log
      </button>
      <button className={`tb-btn${p.showVolume ? " active" : ""}`} aria-pressed={p.showVolume} onClick={() => p.onVolume(!p.showVolume)} title="Volume overlay">
        vol
      </button>
      <button className="tb-btn" onClick={p.onResetView} title="Reset view (double-click an axis to reset it)">
        reset
      </button>
      <button className="tb-btn icon" onClick={p.onChartSettings} title="Chart settings" aria-label="Chart settings">
        <Icon name="settings" size={15} />
      </button>
      {p.grid && p.onGrid && (
        <>
          <span className="tb-sep" />
          <GridPicker value={p.grid} onChange={p.onGrid} />
        </>
      )}
      {p.onCrosshairSync && (
        <button
          className={`tb-btn icon${p.crosshairSync ? " active" : ""}`}
          aria-pressed={!!p.crosshairSync}
          aria-label="Crosshair sync"
          title="Crosshair sync: mirror the crosshair time across the charts of this tab (or of the same link group)"
          onClick={() => p.onCrosshairSync?.(!p.crosshairSync)}
        >
          <Icon name="crosshairSync" size={15} />
        </button>
      )}
      {p.onTimeSync && (
        <button
          className={`tb-btn icon${p.timeSync ? " active" : ""}`}
          aria-pressed={!!p.timeSync}
          aria-label="Time sync"
          title="Time sync: scrolling or zooming one chart shows the same time range on every chart of this tab"
          onClick={() => p.onTimeSync?.(!p.timeSync)}
        >
          <Icon name="timeSync" size={15} />
        </button>
      )}
      <span className="spacer" />
      {p.onFullscreen && (
        <button
          className={`tb-btn icon${p.fullscreen ? " active" : ""}`}
          aria-pressed={!!p.fullscreen}
          aria-label={p.fullscreen ? "Exit full screen" : "Full screen"}
          title={p.fullscreen ? "Exit full screen (Alt+Shift+F or Esc)" : "Full screen (Alt+Shift+F)"}
          onClick={p.onFullscreen}
        >
          <Icon name={p.fullscreen ? "fullscreenExit" : "fullscreen"} size={15} />
        </button>
      )}
      <button
        className="tb-btn icon"
        onClick={p.onTheme}
        title={`Theme: ${THEME_LABEL[p.theme]} (switch to ${THEME_LABEL[nextTheme(p.theme)].toLowerCase()})`}
        aria-label={`Switch to ${THEME_LABEL[nextTheme(p.theme)].toLowerCase()} theme`}
      >
        <Icon name={p.theme === "dark" ? "sun" : p.theme === "light" ? "contrast" : "moon"} size={15} />
      </button>
      <span className="tb-sep" />
      <button className={`tb-btn${p.backtestOpen ? " active" : ""}`} aria-pressed={p.backtestOpen} onClick={p.onToggleBacktest} title="Backtest panel">
        Backtest
      </button>
      {p.onToggleTickerTape && (
        <button
          className={`tb-btn icon${p.tickerTapeOpen ? " active" : ""}`}
          aria-pressed={Boolean(p.tickerTapeOpen)}
          aria-label="Ticker tape"
          onClick={p.onToggleTickerTape}
          title="Ticker tape: the first watchlist scrolling under the toolbar"
        >
          <Icon name="tickerTape" size={15} />
        </button>
      )}
      <button className={`tb-btn${p.watchlistOpen ? " active" : ""}`} aria-pressed={p.watchlistOpen} onClick={p.onToggleWatchlist} title="Watchlist panel">
        Watchlist
      </button>
    </header>
  );
}
