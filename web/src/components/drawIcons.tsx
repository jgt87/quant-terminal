// Icons of the drawing UI (toolbar families, floating toolbar, menus, object tree) on the same
// 18×18 stroke grid as icons.tsx. Merged into <Icon> as a fallback set.

import type { ReactNode } from "react";

export const DRAW_ICONS: Record<string, ReactNode> = {
  grip: <path d="M7 4h.01M11 4h.01M7 9h.01M11 9h.01M7 14h.01M11 14h.01" strokeWidth={2.2} />,
  template: (
    <>
      <rect x="3" y="3" width="12" height="12" rx="1.5" />
      <path d="M3 7h12M7 7v8" />
    </>
  ),
  alertBell: <path d="M9 2.5a4 4 0 0 0-4 4v3.5L3.5 12.5h11L13 10V6.5a4 4 0 0 0-4-4zM7.5 14.5a1.6 1.6 0 0 0 3 0" />,
  more: <path d="M4 9h.01M9 9h.01M14 9h.01" strokeWidth={2.4} />,
  clone: (
    <>
      <rect x="6" y="6" width="9" height="9" rx="1.2" />
      <path d="M3 11.5V4a1 1 0 0 1 1-1h7.5" />
    </>
  ),
  paste: (
    <>
      <rect x="3.5" y="4" width="11" height="11.5" rx="1.2" />
      <path d="M6.5 4V2.5h5V4M6.5 8h5M6.5 11h5" />
    </>
  ),
  layers: <path d="M9 2.5l6.5 3.5L9 9.5 2.5 6zM2.5 9.5L9 13l6.5-3.5M2.5 12.5L9 16l6.5-3.5" />,
  group: (
    <>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="9.5" y="9.5" width="6" height="6" rx="1" />
      <path d="M8.5 5.5h4a1 1 0 0 1 1 1v3M9.5 12.5h-4a1 1 0 0 1-1-1v-3" />
    </>
  ),
  star: <path d="M9 2.5l1.9 4 4.4.5-3.3 3 .9 4.3L9 12.1l-3.9 2.2.9-4.3-3.3-3 4.4-.5z" />,
  starFilled: <path d="M9 2.5l1.9 4 4.4.5-3.3 3 .9 4.3L9 12.1l-3.9 2.2.9-4.3-3.3-3 4.4-.5z" fill="currentColor" />,
  folder: <path d="M2.5 5a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />,
  cross: <path d="M9 2.5v13M2.5 9h13" />,
  dot: <circle cx="9" cy="9" r="2" fill="currentColor" />,
  arrowCursor: <path d="M5 3l9 5.5-4 1 2.5 4.5-1.8 1-2.5-4.5L5 13z" />,
  eraser: <path d="M10.5 3.5l4 4-7 7H4l-1.5-1.5zM7 7l4 4M8 14.5h7.5" />,
  zoomIn: (
    <>
      <circle cx="8" cy="8" r="5" />
      <path d="M11.7 11.7l3.8 3.8M6 8h4M8 6v4" />
    </>
  ),
  stayMode: (
    <>
      <path d="M11.5 3l3.5 3.5-8 8H3.5V11z" />
      <path d="M9.5 5l3.5 3.5" />
    </>
  ),
  lockAll: (
    <>
      <rect x="4" y="8" width="10" height="7" rx="1.2" />
      <path d="M6 8V6a3 3 0 0 1 6 0v2M2.5 4.5l2 1M15.5 4.5l-2 1" />
    </>
  ),
  objectTree: <path d="M3 3.5h5M5 3.5v11M5 8h5M5 13h5M11 6.5h4v3h-4zM11 11.5h4v3h-4z" />,
  bucket: <path d="M4 8l5-5 5 5-5 5zM14 10.5s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3zM2.5 15.5h8" />,
  textColor: <path d="M5 13l4-10 4 10M6.4 9.5h5.2M3 15.5h12" />,
  fontSize: <path d="M2.5 14l3.5-9 3.5 9M3.6 11h4.8M10.5 14l2.5-6 2.5 6M11.3 12h3.4" />,
  chevronLeft: <path d="M11 4.5L6.5 9l4.5 4.5" />,
  pencil: <path d="M11.5 3l3.5 3.5-8 8H3.5V11z" />,
  pitchfork: <path d="M3 15l6-6M9 9V3M9 9h6M6 3h6M15 6v6" />,
  gann: (
    <>
      <rect x="3" y="3" width="12" height="12" />
      <path d="M3 15L15 3M3 15l12-6M3 15L9 3" />
    </>
  ),
  pattern: <path d="M2.5 13l3-7 3 5 3-8 4 10" />,
  elliott: <path d="M2.5 13l3-5 2 3 3-7 2 4 3-3" />,
  cycles: <path d="M2.5 13c1.5-6 4.5-6 6.5 0s5 6 6.5 0" />,
  projection: <path d="M3 15V3M3 15h12M6 12l3-3 2 2 4-5" />,
  brush: <path d="M14.5 3.5l-6 6M8.5 9.5c-1.5-.5-3 .5-3 2s-1 2.5-2.5 3c2.5.5 5 0 5.5-2 .3-1.2 0-2.5 0-3z" />,
  arrow: <path d="M3 15L15 3M8.5 3H15v6.5" />,
  emoji: (
    <>
      <circle cx="9" cy="9" r="6.5" />
      <path d="M6.5 10.5a3 3 0 0 0 5 0M6.8 7h.01M11.2 7h.01" />
    </>
  ),
  rename: <path d="M3 14.5h12M11.5 3l2.5 2.5-6.5 6.5H5V9.5z" />,
  folderPlus: <path d="M2.5 5a1 1 0 0 1 1-1h3.5l1.5 1.5h6a1 1 0 0 1 1 1V13a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1zM9 8v4M7 10h4" />,
  indicatorLine: <path d="M2.5 12l3.5-4 3 2.5 4-6 2.5 3" />,
  pane: <rect x="2.5" y="3.5" width="13" height="11" rx="1.2" />,
  anchor: <path d="M9 5.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM9 5.5V15.5M5.5 8.5h7M3 11a6 6 0 0 0 12 0" />,
};
