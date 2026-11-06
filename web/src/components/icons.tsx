// Inline SVG icons (stroke = currentColor), drawn on an 18x18 grid.

import type { ReactNode } from "react";
import { DRAW_ICONS } from "./drawIcons";
import { ICONS28 } from "./icons28";

const PATHS: Record<string, ReactNode> = {
  cursor: <path d="M5 3l9 5.5-4 1 2.5 4.5-1.8 1-2.5-4.5L5 13z" />,
  trendline: (
    <>
      <path d="M4 14L14 4" />
      <circle cx="4" cy="14" r="1.6" />
      <circle cx="14" cy="4" r="1.6" />
    </>
  ),
  ray: (
    <>
      <path d="M4 14L16.5 1.5" />
      <circle cx="4" cy="14" r="1.6" />
      <circle cx="10" cy="8" r="1.6" />
    </>
  ),
  extended: (
    <>
      <path d="M1.5 16.5l15-15" />
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="6" r="1.6" />
    </>
  ),
  hline: (
    <>
      <path d="M1.5 9h15" />
      <circle cx="9" cy="9" r="1.6" />
    </>
  ),
  hray: (
    <>
      <path d="M5 9h11.5" />
      <circle cx="5" cy="9" r="1.6" />
    </>
  ),
  vline: (
    <>
      <path d="M9 1.5v15" />
      <circle cx="9" cy="9" r="1.6" />
    </>
  ),
  rectangle: <rect x="3" y="5" width="12" height="8" />,
  channel: (
    <>
      <path d="M2 11l10-6M6 15l10-6" />
      <path d="M4 13l10-6" strokeDasharray="1.5 1.5" />
    </>
  ),
  fib: (
    <>
      <path d="M2 3.5h14M2 7h14M2 10h14M2 14.5h14" />
      <path d="M3 14.5L15 3.5" strokeDasharray="1.5 1.5" />
    </>
  ),
  measure: (
    <>
      <path d="M3 15V5M3 15h10" />
      <path d="M6 12l7-7M10 5h3v3" />
    </>
  ),
  text: <path d="M4 4.5h10M9 4.5V15M7 15h4" />,
  magnet: (
    <>
      <path d="M4.5 3v6a4.5 4.5 0 009 0V3" />
      <path d="M4.5 6h3M10.5 6h3M7.5 3v6a1.5 1.5 0 003 0V3" />
    </>
  ),
  trash: <path d="M3.5 5h11M7 5V3.5h4V5M5 5l.8 10h6.4L13 5M7.5 8v4.5M10.5 8v4.5" />,
  eye: (
    <>
      <path d="M1.5 9S4.5 4 9 4s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z" />
      <circle cx="9" cy="9" r="2.2" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M1.5 9S4.5 4 9 4s7.5 5 7.5 5-3 5-7.5 5-7.5-5-7.5-5z" />
      <path d="M3 15L15 3" />
    </>
  ),
  settings: (
    <>
      <circle cx="9" cy="9" r="2.3" />
      <path d="M9 2v2.2M9 13.8V16M2 9h2.2M13.8 9H16M4 4l1.6 1.6M12.4 12.4L14 14M4 14l1.6-1.6M12.4 5.6L14 4" />
    </>
  ),
  close: <path d="M4.5 4.5l9 9M13.5 4.5l-9 9" />,
  plus: <path d="M9 3.5v11M3.5 9h11" />,
  search: (
    <>
      <circle cx="8" cy="8" r="4.5" />
      <path d="M11.5 11.5L15.5 15.5" />
    </>
  ),
  chevronDown: <path d="M5 7l4 4 4-4" />,
  chevronUp: <path d="M5 11l4-4 4 4" />,
  indicators: <path d="M2 14c2.5 0 3-8 5.5-8s2.5 6 5 6 2.5-7 3.5-7" />,
  candles: (
    <>
      <path d="M5.5 2.5v13M12.5 2.5v13" />
      <rect x="4" y="5" width="3" height="7" fill="currentColor" />
      <rect x="11" y="6" width="3" height="5" />
    </>
  ),
  play: <path d="M5.5 3.5v11l9-5.5z" />,
  sun: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M9 1.8v1.8M9 14.4v1.8M1.8 9h1.8M14.4 9h1.8M3.9 3.9l1.3 1.3M12.8 12.8l1.3 1.3M3.9 14.1l1.3-1.3M12.8 5.2l1.3-1.3" />
    </>
  ),
  moon: <path d="M14.5 11.2A6 6 0 0 1 6.8 3.5a6 6 0 1 0 7.7 7.7z" />,
  lock: (
    <>
      <rect x="4" y="8" width="10" height="7.5" rx="1.2" />
      <path d="M6 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  unlock: (
    <>
      <rect x="4" y="8" width="10" height="7.5" rx="1.2" />
      <path d="M6 8V6a3 3 0 0 1 5.8-1" />
    </>
  ),
  copy: (
    <>
      <rect x="6" y="6" width="9" height="9" rx="1.2" />
      <path d="M3 12V4a1 1 0 0 1 1-1h8" />
    </>
  ),
  check: <path d="M4 9.5l3.2 3L14 5.5" />,
  chevronRight: <path d="M7 4.5L11.5 9 7 13.5" />,
  lineSolid: <path d="M2.5 9h13" />,
  lineDashed: <path d="M2.5 9h3.5M8 9h3.5M13.5 9h2" />,
  lineDotted: <path d="M3 9h.01M6 9h.01M9 9h.01M12 9h.01M15 9h.01" strokeWidth={2.2} />,
  listPlus: <path d="M3 5h9M3 9h9M3 13h5M13.5 10.5v5M11 13h5" />,
  maximize: <path d="M3.5 7V3.5H7M11 3.5h3.5V7M14.5 11v3.5H11M7 14.5H3.5V11" />,
  restore: <path d="M7 3.5V7H3.5M11 3.5V7h3.5M14.5 11H11v3.5M3.5 11H7v3.5" />,
  crosshairSync: (
    <>
      <path d="M9 2v14M2 9h4M12 9h4" />
      <circle cx="9" cy="9" r="2.2" />
    </>
  ),
  contrast: (
    <>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M9 2.5v13a6.5 6.5 0 0 0 0-13z" fill="currentColor" />
    </>
  ),
  timeSync: (
    <>
      <path d="M2.5 6h13M2.5 12h13" />
      <path d="M5.5 3.5 2.5 6l3 2.5M12.5 9.5l3 2.5-3 2.5" />
    </>
  ),
  pause: <path d="M6.5 4v10M11.5 4v10" strokeWidth={2} />,
  stepForward: <path d="M4.5 4.5v9l6.5-4.5zM13.5 4.5v9" />,
  replay: (
    <>
      <path d="M3.5 9a5.5 5.5 0 1 0 1.6-3.9" />
      <path d="M3.5 3.5v2.4h2.4M8 6.5v5l3.5-2.5z" />
    </>
  ),
  compare: <path d="M2.5 13.5l4-5 3 3 6-7M11.5 4.5h4v4" />,
  vprofile: <path d="M4 3v12M4 5h6M4 7.5h9M4 10h7M4 12.5h4M15 3v12" />,
  avprofile: <path d="M4 3v12M4 5h5M4 7.5h9M4 10h7M4 12.5h3" />,
  download: <path d="M9 3v8.5M5.5 8L9 11.5 12.5 8M3.5 14.5h11" />,
  keyboard: (
    <>
      <rect x="2" y="4.5" width="14" height="9" rx="1.5" />
      <path d="M5 7.5h.01M8 7.5h.01M11 7.5h.01M13 7.5h.01M6 10.5h6" />
    </>
  ),
};

/**
 * Icon by name. The 28×28 set (icons28.tsx: crisp 1px strokes) wins; names only in the older
 * 18×18 sets fall back to those. `path` / `fill` draw a tool's own 28×28 icon (DrawingToolDef
 * iconPath / iconFill).
 */
export function Icon({ name, size = 18, path, fill }: { name: string; size?: number; path?: string; fill?: string }) {
  const art28 = path || fill ? null : ICONS28[name];
  if (path || fill || art28) {
    return (
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {art28 ?? (
          <>
            {path && <path d={path} />}
            {fill && <path d={fill} fill="currentColor" stroke="none" />}
          </>
        )}
      </svg>
    );
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name] ?? DRAW_ICONS[name] ?? null}
    </svg>
  );
}
