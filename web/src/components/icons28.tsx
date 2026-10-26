// Icon art on a 28×28 grid: 1px strokes on half-pixel coordinates (crisp at 1×), currentColor,
// fills only for small solid parts (anchor dots, arrow heads). These win over the 18×18 sets.
// Own drawings; sizes and density follow docs/reference/drawing-ui-style.md.

import type { ReactNode } from "react";

const dot = (cx: number, cy: number, r = 2) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
const ring = (cx: number, cy: number, r = 2) => <circle cx={cx} cy={cy} r={r} />;
const lockBody = <rect x="8.5" y="13.5" width="11" height="9" rx="1.5" />;
const eyeShape = <path d="M4.5 14.5s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />;
const starPath = "M14.5 5l2.8 5.8 6.2.8-4.6 4.3 1.2 6.2-5.6-3.1-5.6 3.1 1.2-6.2-4.6-4.3 6.2-.8z";
const bell = <path d="M14.5 5.5a6 6 0 0 0-6 6v5l-2 3h16l-2-3v-5a6 6 0 0 0-6-6zM12.5 21.5a2 2 0 0 0 4 0" />;
const twoSheets = (
  <>
    <rect x="10.5" y="10.5" width="12" height="12" rx="1" />
    <path d="M6.5 17.5v-10a1 1 0 0 1 1-1h10" />
  </>
);

export const ICONS28: Record<string, ReactNode> = {
  // ---------- cursors ----------
  cross: <path d="M14.5 4.5v20M4.5 14.5h20" />,
  dot: dot(14.5, 14.5, 2.5),
  arrowCursor: <path d="M9.5 5.5v15.5l4-3.8 2.6 6.1 2.3-1-2.6-6h5.7z" />,
  demonstration: (
    <>
      <path d="M15.5 6.5v12l3-2.8 2.1 4.8 1.9-.8-2.1-4.7h4.6z" />
      <path d="M4.5 22.5c3.5-.5 6-2.5 7.5-6" strokeDasharray="1.5 2" />
    </>
  ),
  eraser: <path d="M16.5 5.5l6 6-9.5 9.5H7l-3-3zM11.5 10.5l6 6M9.5 22.5h14" />,
  // ---------- drawing tools ----------
  trendline: (
    <>
      <path d="M8 20L20 8" />
      {ring(6.5, 21.5)}
      {ring(21.5, 6.5)}
    </>
  ),
  ray: (
    <>
      <path d="M8 20L24.5 3.5" />
      {ring(6.5, 21.5)}
      {ring(14.5, 13.5)}
    </>
  ),
  extended: (
    <>
      <path d="M3.5 24.5l5.5-5.5M12 16l3.5-3.5M19 9l5.5-5.5" />
      {ring(10.5, 17.5)}
      {ring(17.5, 10.5)}
    </>
  ),
  hline: (
    <>
      <path d="M3.5 14.5h9M16.5 14.5h8" />
      {ring(14.5, 14.5)}
    </>
  ),
  hray: (
    <>
      <path d="M10.5 14.5h14" />
      {ring(8.5, 14.5)}
    </>
  ),
  vline: (
    <>
      <path d="M14.5 3.5v9M14.5 16.5v8" />
      {ring(14.5, 14.5)}
    </>
  ),
  crossline: (
    <>
      <path d="M3.5 14.5h21M14.5 3.5v21" />
      {dot(14.5, 14.5, 2)}
    </>
  ),
  channel: (
    <>
      <path d="M4.5 17.5l14-11M9.5 23.5l14-11" />
      <path d="M7 20.5l14-11" strokeDasharray="2 2" />
    </>
  ),
  fib: (
    <>
      <path d="M4.5 5.5h19M4.5 10.5h19M4.5 15.5h19M4.5 22.5h19" />
      <path d="M6.5 22.5L21.5 5.5" strokeDasharray="2 2" />
    </>
  ),
  rectangle: (
    <>
      <rect x="6.5" y="8.5" width="15" height="11" />
      {dot(6.5, 8.5, 1.5)}
      {dot(21.5, 19.5, 1.5)}
    </>
  ),
  text: <path d="M7.5 7.5h14M14.5 7.5v14M11.5 21.5h6" />,
  measure: <path d="M5.5 22.5V5.5M5.5 22.5h17M9.5 18.5l10-10M14.5 8.5h5v5" />,
  vprofile: <path d="M6.5 4.5v19M6.5 7.5h8M6.5 11.5h13M6.5 15.5h10M6.5 19.5h5M22.5 4.5v19" />,
  avprofile: <path d="M6.5 4.5v19M6.5 7.5h8M6.5 11.5h14M6.5 15.5h10M6.5 19.5h5" />,
  // ---------- toolbar bottom ----------
  zoomIn: (
    <>
      <circle cx="12.5" cy="12.5" r="6.5" />
      <path d="M17.5 17.5l6 6M9.5 12.5h6M12.5 9.5v6" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="12.5" cy="12.5" r="6.5" />
      <path d="M17.5 17.5l6 6M9.5 12.5h6" />
    </>
  ),
  magnet: <path d="M8.5 5.5v8a6 6 0 0 0 12 0v-8h-4v8a2 2 0 0 1-4 0v-8zM8.5 9.5h4M16.5 9.5h4" />,
  stayMode: <path d="M17.5 5.5l5 5-11 11h-5v-5zM15.5 7.5l5 5M6.5 24.5h16" />,
  lockAll: (
    <>
      {lockBody}
      <path d="M10.5 13.5v-3a4 4 0 0 1 8 0v3M14.5 16.5v3M4.5 9.5l2 1M24.5 9.5l-2 1" />
    </>
  ),
  eye: (
    <>
      {eyeShape}
      <circle cx="14.5" cy="14.5" r="3" />
    </>
  ),
  eyeOff: (
    <>
      {eyeShape}
      <circle cx="14.5" cy="14.5" r="3" />
      <path d="M5.5 23.5l18-18" />
    </>
  ),
  trash: <path d="M6.5 8.5h16M11.5 8.5v-2h6v2M8.5 8.5l1 14h10l1-14M12.5 12.5v6M16.5 12.5v6" />,
  objectTree: (
    <>
      <path d="M5.5 6.5h7M8.5 6.5v14M8.5 13.5h5M8.5 20.5h5" />
      <rect x="15.5" y="11.5" width="7" height="4" />
      <rect x="15.5" y="18.5" width="7" height="4" />
    </>
  ),
  star: <path d={starPath} />,
  starFilled: <path d={starPath} fill="currentColor" />,
  favorites: <path d={starPath} />,
  chevronRight: <path d="M11.5 8.5l6 6-6 6" />,
  chevronDown: <path d="M8.5 11.5l6 6 6-6" />,
  // ---------- menus and floating toolbar ----------
  lock: (
    <>
      {lockBody}
      <path d="M10.5 13.5v-3a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      {lockBody}
      <path d="M10.5 13.5v-3a4 4 0 0 1 7.6-1.8" />
    </>
  ),
  settings: (
    <>
      <circle cx="14.5" cy="14.5" r="3.5" />
      <circle cx="14.5" cy="14.5" r="7" />
      <path d="M14.5 4.5v3M14.5 21.5v3M4.5 14.5h3M21.5 14.5h3M7.4 7.4l2.1 2.1M19.5 19.5l2.1 2.1M7.4 21.6l2.1-2.1M19.5 9.5l2.1-2.1" />
    </>
  ),
  alertBell: bell,
  alerts: bell,
  layers: <path d="M14.5 5.5l9 4.5-9 4.5-9-4.5zM5.5 14.5l9 4.5 9-4.5M5.5 18.5l9 4.5 9-4.5" />,
  clone: twoSheets,
  copy: twoSheets,
  paste: (
    <>
      <rect x="7.5" y="6.5" width="14" height="17" rx="1" />
      <path d="M11.5 6.5v-2h6v2M10.5 12.5h8M10.5 16.5h8M10.5 20.5h5" />
    </>
  ),
  template: (
    <>
      <rect x="5.5" y="5.5" width="17" height="17" rx="1" />
      <path d="M5.5 11.5h17M11.5 11.5v11" />
    </>
  ),
  grip: (
    <>
      {dot(11.5, 8.5, 1.2)}
      {dot(16.5, 8.5, 1.2)}
      {dot(11.5, 14.5, 1.2)}
      {dot(16.5, 14.5, 1.2)}
      {dot(11.5, 20.5, 1.2)}
      {dot(16.5, 20.5, 1.2)}
    </>
  ),
  more: (
    <>
      {dot(8.5, 14.5, 1.6)}
      {dot(14.5, 14.5, 1.6)}
      {dot(20.5, 14.5, 1.6)}
    </>
  ),
  pencil: <path d="M17.5 5.5l5 5-11 11h-5v-5zM15.5 7.5l5 5" />,
  bucket: <path d="M7.5 13.5l7-7 7 7-7 7zM7.5 13.5h14M22.5 16.5s2 2.5 2 4a2 2 0 0 1-4 0c0-1.5 2-4 2-4z" />,
  textColor: <path d="M9.5 19.5l5-13 5 13M11.5 14.5h6" />,
  lineSolid: <path d="M4.5 14.5h20" />,
  lineDashed: <path d="M4.5 14.5h5M11.5 14.5h5M18.5 14.5h6" />,
  lineDotted: (
    <>
      {dot(5.5, 14.5, 1)}
      {dot(10, 14.5, 1)}
      {dot(14.5, 14.5, 1)}
      {dot(19, 14.5, 1)}
      {dot(23.5, 14.5, 1)}
    </>
  ),
  anchor: <path d="M14.5 8.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM14.5 8.5v15M10.5 11.5h8M6.5 16.5a8 8 0 0 0 16 0" />,
  plus: <path d="M14.5 7.5v14M7.5 14.5h14" />,
  close: <path d="M8.5 8.5l12 12M20.5 8.5l-12 12" />,
  check: <path d="M7.5 14.5l5 5 9-10" />,
  // ---------- top toolbar and panel rail ----------
  search: (
    <>
      <circle cx="12.5" cy="12.5" r="6.5" />
      <path d="M17.5 17.5l6 6" />
    </>
  ),
  replay: <path d="M6.5 14.5a8 8 0 1 0 2.4-5.7M6.5 5.5v4h4M12.5 10.5v8l6-4z" />,
  indicators: <path d="M4.5 19.5l5-6 4 3 6-8 4 4" />,
  crosshairSync: (
    <>
      <path d="M14.5 4.5v6M14.5 18.5v6M4.5 14.5h6M18.5 14.5h6" />
      <circle cx="14.5" cy="14.5" r="2.5" />
    </>
  ),
  compare: <path d="M4.5 20.5l6-7 4 4 9-10M18.5 7.5h5v5" />,
  candles: <path d="M8.5 9.5h4v9h-4zM10.5 6.5v3M10.5 18.5v3M16.5 7.5h4v9h-4zM18.5 4.5v3M18.5 16.5v4" />,
  watchlist: (
    <>
      <path d="M9.5 8.5h14M9.5 14.5h14M9.5 20.5h14" />
      {dot(5.5, 8.5, 1.2)}
      {dot(5.5, 14.5, 1.2)}
      {dot(5.5, 20.5, 1.2)}
    </>
  ),
  screener: <path d="M5.5 6.5h18l-7 8.5v6l-4 2v-8z" />,
  portfolio: <path d="M13.5 5.5a9 9 0 1 0 9 9h-9zM16.5 3.5v8h8a8 8 0 0 0-8-8z" />,
  paper: (
    <>
      <rect x="5.5" y="9.5" width="18" height="12" rx="1.5" />
      <path d="M11.5 9.5v-2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M5.5 14.5h18" />
    </>
  ),
  sun: (
    <>
      <circle cx="14.5" cy="14.5" r="4.5" />
      <path d="M14.5 4.5v2.5M14.5 22v2.5M4.5 14.5H7M22 14.5h2.5M7.4 7.4l1.8 1.8M19.8 19.8l1.8 1.8M7.4 21.6l1.8-1.8M19.8 9.2l1.8-1.8" />
    </>
  ),
  moon: <path d="M20.5 17.5a8 8 0 0 1-10-10 8 8 0 1 0 10 10z" />,
  keyboard: (
    <>
      <rect x="4.5" y="8.5" width="20" height="12" rx="1.5" />
      <path d="M8.5 12.5h1M12.5 12.5h1M16.5 12.5h1M20.5 12.5h0M9.5 16.5h10" />
    </>
  ),
  scripts: <path d="M10.5 8.5l-5.5 6 5.5 6M18.5 8.5l5.5 6-5.5 6M16.5 6.5l-4 16" />,
};
