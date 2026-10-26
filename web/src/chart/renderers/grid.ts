import { crisp, hairline } from "../canvas";
import type { PriceTick } from "../PriceScale";
import type { TimeTick } from "../TimeScale";
import type { PaneRenderCtx } from "./types";

export function drawGrid(rc: PaneRenderCtx, priceTicks: PriceTick[], timeTicks: TimeTick[]): void {
  const { ctx, width, height, dpr, theme } = rc;
  ctx.strokeStyle = theme.grid;
  ctx.lineWidth = hairline(dpr);
  ctx.beginPath();
  for (const t of priceTicks) {
    const y = crisp(t.y, dpr);
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  for (const t of timeTicks) {
    const x = crisp(t.x, dpr);
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  ctx.stroke();
}
