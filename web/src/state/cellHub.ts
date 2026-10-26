// Registry of the mounted chart cells of the active tab, by cell index. The workspace uses it to
// apply link-group updates and crosshair/time sync directly to other cells (same frame, no
// React round trip through the parent).

import type { Layout } from "@qt/core";
import type { ChartEngine } from "../chart/ChartEngine";
import type { CellValues } from "./links";

export interface CellHandle {
  layout(): Layout | null;
  /** Raw layout update of that cell (no link propagation). */
  update(fn: (l: Layout) => Layout): void;
  engine(): ChartEngine | null;
}

export class CellHub {
  private cells = new Map<number, CellHandle>();

  set(index: number, h: CellHandle): void {
    this.cells.set(index, h);
  }

  delete(index: number, h: CellHandle): void {
    if (this.cells.get(index) === h) this.cells.delete(index);
  }

  get(index: number): CellHandle | undefined {
    return this.cells.get(index);
  }

  /** Symbol/interval per cell index (null where nothing is loaded). */
  values(count: number): (CellValues | null)[] {
    return Array.from({ length: count }, (_, i) => {
      const l = this.cells.get(i)?.layout();
      return l ? { symbol: l.symbol, interval: l.interval, ...(l.customInterval ? { customInterval: l.customInterval } : {}) } : null;
    });
  }

  engines(): ChartEngine[] {
    return [...this.cells.values()].map((h) => h.engine()).filter((e): e is ChartEngine => e !== null);
  }
}
