// Device-pixel-ratio aware canvas layer and pixel-snapping helpers.

export class CanvasLayer {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  width = 0;
  height = 0;
  dpr = 1;

  constructor(parent: HTMLElement, className: string) {
    this.canvas = document.createElement("canvas");
    this.canvas.className = className;
    parent.appendChild(this.canvas);
    const ctx = this.canvas.getContext("2d", { alpha: true });
    if (!ctx) throw new Error("Canvas 2D is not available");
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    const w = Math.max(1, Math.round(width * dpr));
    const h = Math.max(1, Math.round(height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
  }

  /** Reset transform to media pixels and clear. */
  begin(): CanvasRenderingContext2D {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    return ctx;
  }

  destroy(): void {
    this.canvas.remove();
  }
}

/** Width in media px of a hairline that is a whole number of device pixels. */
export function hairline(dpr: number, devicePx = 1): number {
  return Math.max(1, Math.floor(dpr * devicePx)) / dpr;
}

/** Snap a coordinate so a hairline drawn through it covers whole device pixels. */
export function crisp(v: number, dpr: number): number {
  const w = Math.max(1, Math.floor(dpr));
  const d = Math.round(v * dpr);
  return (w % 2 === 1 ? d + 0.5 : d) / dpr;
}

/** Snap to the device pixel grid (for rect edges). */
export function snap(v: number, dpr: number): number {
  return Math.round(v * dpr) / dpr;
}
