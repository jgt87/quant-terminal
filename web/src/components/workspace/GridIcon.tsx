// Small picture of a grid layout, drawn from the grid geometry itself.

import type { GridKind } from "@qt/core";
import { cellRects } from "../../state/grid";

const W = 20;
const H = 14;

export function GridIcon({ kind, size = 20 }: { kind: GridKind; size?: number }) {
  return (
    <svg className="grid-icon" width={size} height={(size * H) / W} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {cellRects(kind).map((r, i) => (
        <rect key={i} x={r.left * W + 0.75} y={r.top * H + 0.75} width={Math.max(0.5, r.width * W - 1.5)} height={Math.max(0.5, r.height * H - 1.5)} rx={1} />
      ))}
    </svg>
  );
}
