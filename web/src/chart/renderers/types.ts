import type { PriceScale } from "../PriceScale";
import type { TimeScale } from "../TimeScale";
import type { ChartTheme } from "../theme";

/** Everything a renderer needs to draw into one pane. The context is translated to the pane top. */
export interface PaneRenderCtx {
  ctx: CanvasRenderingContext2D;
  ts: TimeScale;
  ps: PriceScale;
  /** Plot width (excludes the price axis) and pane height, media px. */
  width: number;
  height: number;
  from: number;
  to: number;
  dpr: number;
  theme: ChartTheme;
}
