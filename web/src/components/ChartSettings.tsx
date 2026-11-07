// Chart settings window: Symbol (candle colors), Status line, Scales and Appearance tabs.
// Stored per layout as `chartSettings`; edits preview live and Cancel restores the original.

import { useState } from "react";
import type { ChartSettings as Settings, ChartType } from "@qt/core";
import { chartTheme, type ThemeMode } from "../chart/theme";
import { ZONE_CHOICES, zoneLabel } from "../chart/timeZone";
import { ColorPicker } from "./ColorPicker";
import { SettingsDialog } from "./SettingsDialog";
import { Check, Row } from "./SettingsFields";
import { TransformFields } from "./TransformFields";

type Tab = "symbol" | "status" | "scales" | "appearance";

interface Props {
  value: Settings | undefined;
  /** Chart type of the layout (its parameters show on the Symbol tab). */
  chartType?: ChartType;
  mode: ThemeMode;
  onChange(next: Settings | undefined): void;
  onClose(): void;
}

export function ChartSettings({ value, chartType = "candles", mode, onChange, onClose }: Props) {
  const [original] = useState(value);
  const [cs, setCs] = useState<Settings>(value ?? {});
  const base = chartTheme(mode);
  const apply = (next: Settings) => {
    setCs(next);
    onChange(next);
  };
  const sym = (patch: NonNullable<Settings["symbol"]>) => apply({ ...cs, symbol: { ...cs.symbol, ...patch } });
  const status = (patch: NonNullable<Settings["statusLine"]>) => apply({ ...cs, statusLine: { ...cs.statusLine, ...patch } });
  const scales = (patch: NonNullable<Settings["scales"]>) => apply({ ...cs, scales: { ...cs.scales, ...patch } });
  const look = (patch: NonNullable<Settings["appearance"]>) => apply({ ...cs, appearance: { ...cs.appearance, ...patch } });

  return (
    <SettingsDialog<Tab>
      title="Chart settings"
      tabs={[
        { id: "symbol", label: "Symbol" },
        { id: "status", label: "Status line" },
        { id: "scales", label: "Scales" },
        { id: "appearance", label: "Appearance" },
      ]}
      width={460}
      onOk={onClose}
      onCancel={() => {
        onChange(original);
        onClose();
      }}
      onDefaults={() => apply({})}
    >
      {(tab) => {
        if (tab === "symbol")
          return (
            <>
              <div className="settings-section">Candles</div>
              <Row label="Body up">
                <ColorPicker label="Body up" value={cs.symbol?.upColor ?? base.upBody} onChange={(upColor) => sym({ upColor })} />
              </Row>
              <Row label="Body down">
                <ColorPicker label="Body down" value={cs.symbol?.downColor ?? base.downBody} onChange={(downColor) => sym({ downColor })} />
              </Row>
              <Row label="Border up">
                <ColorPicker label="Border up" value={cs.symbol?.upBorder ?? base.upBorder} onChange={(upBorder) => sym({ upBorder })} />
              </Row>
              <Row label="Border down">
                <ColorPicker label="Border down" value={cs.symbol?.downBorder ?? base.downBorder} onChange={(downBorder) => sym({ downBorder })} />
              </Row>
              <Row label="Wick up">
                <ColorPicker label="Wick up" value={cs.symbol?.upWick ?? base.upWick} onChange={(upWick) => sym({ upWick })} />
              </Row>
              <Row label="Wick down">
                <ColorPicker label="Wick down" value={cs.symbol?.downWick ?? base.downWick} onChange={(downWick) => sym({ downWick })} />
              </Row>
              <Check label="Hollow up candles" checked={Boolean(cs.symbol?.hollow)} onChange={(hollow) => sym({ hollow })} />
              <TransformFields
                chartType={chartType}
                value={cs.symbol?.transform}
                onChange={(transform) => sym({ transform })}
                baseline={cs.symbol?.baseline}
                onBaseline={(baseline) => sym({ baseline })}
              />
              <div className="settings-section">Data</div>
              <Check label="Adjust for dividends" checked={Boolean(cs.symbol?.adjustDividends)} onChange={(adjustDividends) => sym({ adjustDividends })} />
              <Check label="Extended hours (intraday)" checked={Boolean(cs.symbol?.extendedHours)} onChange={(extendedHours) => sym({ extendedHours })} />
            </>
          );
        if (tab === "status")
          return (
            <>
              <Check label="OHLC values" checked={cs.statusLine?.ohlc !== false} onChange={(ohlc) => status({ ohlc })} />
              <Check label="Bar change" checked={cs.statusLine?.change !== false} onChange={(change) => status({ change })} />
              <Check label="Volume" checked={cs.statusLine?.volume !== false} onChange={(volume) => status({ volume })} />
              <Check label="Indicator values" checked={cs.statusLine?.indicatorValues !== false} onChange={(indicatorValues) => status({ indicatorValues })} />
            </>
          );
        if (tab === "scales")
          return (
            <>
              <Check label="Last price label" checked={cs.scales?.lastPriceLabel !== false} onChange={(lastPriceLabel) => scales({ lastPriceLabel })} />
              <Check label="Last price line" checked={cs.scales?.priceLine !== false} onChange={(priceLine) => scales({ priceLine })} />
              <Check label="Countdown to bar close (intraday)" checked={Boolean(cs.scales?.countdown)} onChange={(countdown) => scales({ countdown })} />
              <Check label="High and low labels" checked={Boolean(cs.scales?.highLow)} onChange={(highLow) => scales({ highLow })} />
              <Check label="Percent scale" checked={Boolean(cs.scales?.percent) && !cs.scales?.indexed} onChange={(percent) => scales({ percent, indexed: percent ? false : cs.scales?.indexed })} />
              <Check label="Indexed to 100" checked={Boolean(cs.scales?.indexed)} onChange={(indexed) => scales({ indexed, percent: indexed ? false : cs.scales?.percent })} />
              <Check label="Invert scale" checked={Boolean(cs.scales?.inverted)} onChange={(inverted) => scales({ inverted })} />
              <Row label="Price scale position">
                <select value={cs.scales?.placement ?? "right"} onChange={(e) => scales({ placement: e.target.value as "left" | "right" | "both" })}>
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                  <option value="both">Both</option>
                </select>
              </Row>
              <div className="settings-section">Time</div>
              <Row label="Time zone">
                <select value={cs.timeZone ?? "UTC"} onChange={(e) => apply({ ...cs, timeZone: e.target.value === "UTC" ? undefined : e.target.value })} aria-label="Time zone">
                  {ZONE_CHOICES.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.id.includes("/") ? `${z.label} (${zoneLabel(z.id, Date.now() / 1000)})` : z.label}
                    </option>
                  ))}
                  {cs.timeZone && !ZONE_CHOICES.some((z) => z.id === cs.timeZone) && <option value={cs.timeZone}>{cs.timeZone}</option>}
                </select>
              </Row>
              <Check label="Session breaks (intraday)" checked={Boolean(cs.appearance?.sessionBreaks)} onChange={(sessionBreaks) => look({ sessionBreaks })} />
            </>
          );
        return (
          <>
            <Row label="Background">
              <ColorPicker label="Background" noAlpha value={cs.appearance?.background ?? base.background} onChange={(background) => look({ background })} />
            </Row>
            <Check label="Symbol watermark" checked={Boolean(cs.appearance?.watermark)} onChange={(watermark) => look({ watermark })} />
            <Check label="Vertical grid lines" checked={cs.appearance?.gridVertical !== false} onChange={(gridVertical) => look({ gridVertical })} />
            <Check label="Horizontal grid lines" checked={cs.appearance?.gridHorizontal !== false} onChange={(gridHorizontal) => look({ gridHorizontal })} />
            <Row label="Crosshair">
              <select
                value={cs.appearance?.crosshair ?? "dashed"}
                onChange={(e) => look({ crosshair: e.target.value as NonNullable<Settings["appearance"]>["crosshair"] })}
              >
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
                <option value="solid">Solid</option>
                <option value="hidden">Hidden</option>
              </select>
            </Row>
          </>
        );
      }}
    </SettingsDialog>
  );
}
