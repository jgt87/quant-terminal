// OHLCV legend for the main series and per-indicator legend rows with hovered values.

import type { Interval, SymbolInfo } from "@qt/core";
import { formatCompact, formatPct, formatPrice, formatSigned } from "../chart/format";
import type { LegendCompare, LegendData, LegendIndicator } from "../chart/legend";
import { Icon } from "./icons";

interface MainLegendProps {
  symbol: string;
  info: SymbolInfo | null;
  /** Interval text (a custom interval such as "2h" included). */
  interval: Interval | string;
  legend: LegendData | null;
  intraday: boolean;
  decimals: number;
  loading: boolean;
  /** Status line fields (chart settings). */
  show?: { ohlc: boolean; change: boolean; volume: boolean };
}

export function MainLegend({ symbol, info, interval, legend, decimals, loading, show = { ohlc: true, change: true, volume: true } }: MainLegendProps) {
  const b = legend?.bar;
  const dirClass = legend && legend.change < 0 ? "neg" : "pos";
  return (
    <div className="legend-main">
      <span className="legend-symbol">{symbol}</span>
      <span className="legend-meta">
        {interval}
        {info ? ` · ${info.exchange}` : ""}
      </span>
      {info?.name && <span className="legend-name">{info.name}</span>}
      {b && (show.ohlc || show.change || show.volume) && (
        <span className={`legend-ohlc ${dirClass}`}>
          {show.ohlc && (
            <>
              <Field k="O" v={formatPrice(b.open, decimals)} />
              <Field k="H" v={formatPrice(b.high, decimals)} />
              <Field k="L" v={formatPrice(b.low, decimals)} />
              <Field k="C" v={formatPrice(b.close, decimals)} />
            </>
          )}
          {show.change && (
            <span className="legend-chg">
              {formatSigned(legend.change, decimals)} ({formatPct(legend.changePct)})
            </span>
          )}
          {show.volume && <Field k="V" v={formatCompact(b.volume)} />}
        </span>
      )}
      {loading && <span className="legend-loading">loading</span>}
      {legend?.transform && (
        <span className="legend-transform" data-testid="legend-transform" title="Price-only chart type: edit its parameters in Chart settings › Symbol">
          Transformed: {legend.transform}
        </span>
      )}
    </div>
  );
}

/** One compare symbol: color swatch, symbol, percent change and a remove button. */
export function CompareLegend({ item, onRemove }: { item: LegendCompare; onRemove(): void }) {
  return (
    <div className="legend-ind legend-compare" data-compare-symbol={item.symbol}>
      <span className="legend-swatch" style={{ background: item.color }} />
      <span className="legend-ind-name">{item.symbol}</span>
      {item.error ? (
        <span className="legend-error">{item.error}</span>
      ) : (
        <span className="legend-ind-val" style={{ color: item.color }}>
          {item.pct == null ? "—" : formatPct(item.pct)}
        </span>
      )}
      <span className="legend-actions">
        <button className="icon-btn" title="Remove compare symbol" aria-label={`Remove ${item.symbol}`} onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      </span>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <span className="legend-field">
      <span className="legend-key">{k}</span>
      <span className="legend-val">{v}</span>
    </span>
  );
}

interface IndicatorLegendProps {
  item: LegendIndicator;
  format(v: number): string;
  onRemove(): void;
  onEdit(): void;
  onToggle(): void;
  onContextMenu(clientX: number, clientY: number): void;
  showValues?: boolean;
}

export function IndicatorLegend({ item, format, onRemove, onEdit, onToggle, onContextMenu, showValues = true }: IndicatorLegendProps) {
  return (
    <div
      className={`legend-ind${item.visible ? "" : " hidden"}`}
      data-indicator-uid={item.uid}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e.clientX, e.clientY);
      }}
      onDoubleClick={onEdit}
    >
      <span className="legend-ind-name">{item.label}</span>
      {item.error ? (
        <span className="legend-error">{item.error}</span>
      ) : (
        showValues &&
        item.values.map((v) => (
          <span key={v.label} className="legend-ind-val" style={{ color: v.color }} title={v.label}>
            {v.value == null ? "—" : format(v.value)}
          </span>
        ))
      )}
      <span className="legend-actions">
        <button className="icon-btn" title={item.visible ? "Hide" : "Show"} onClick={onToggle}>
          <Icon name={item.visible ? "eye" : "eyeOff"} size={14} />
        </button>
        <button className="icon-btn" title="Settings" onClick={onEdit}>
          <Icon name="settings" size={14} />
        </button>
        <button className="icon-btn" title="Remove" onClick={onRemove}>
          <Icon name="close" size={14} />
        </button>
      </span>
    </div>
  );
}
