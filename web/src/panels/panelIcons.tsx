// Icons of the panel rail and panel toolbars (18x18 grid, stroke = currentColor). Names not
// defined here fall back to the shared icon set.

import type { ReactNode } from "react";
import { Icon } from "../components/icons";
import { ICONS28 } from "../components/icons28";

const PATHS: Record<string, ReactNode> = {
  watchlist: <path d="M3 4.5h12M3 9h12M3 13.5h12M3 4.5h.01" />,
  alerts: <path d="M9 2.5a4 4 0 0 0-4 4v3.5L3.5 12.5h11L13 10V6.5a4 4 0 0 0-4-4zM7.5 14.5a1.6 1.6 0 0 0 3 0" />,
  screener: <path d="M2.5 3.5h13l-5 6v5l-3-1.5v-3.5z" />,
  portfolio: (
    <>
      <path d="M9 2.5a6.5 6.5 0 1 0 6.5 6.5H9z" />
      <path d="M11 1.8v5.2h5.2A5.2 5.2 0 0 0 11 1.8z" />
    </>
  ),
  paper: (
    <>
      <rect x="2.5" y="5.5" width="13" height="9" rx="1.2" />
      <path d="M6.5 5.5V4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5M2.5 9.5h13" />
    </>
  ),
  scripts: <path d="M6.5 4.5L2.5 9l4 4.5M11.5 4.5l4 4.5-4 4.5M10 3l-2 12" />,
  dataTable: <path d="M2.5 3.5h13v11h-13zM2.5 7h13M2.5 10.5h13M6.5 3.5v11" />,
  options: <path d="M2.5 15.5l4-6 3 3 6-9M11.5 3.5h4v4" />,
  dom: <path d="M2.5 2.5h13v13h-13zM2.5 6.5h13M2.5 10.5h13M7 2.5v13M11 2.5v13M3.5 4.5h2M12 8.5h2.5M3.5 12.5h3" />,
  tape: <path d="M2.5 3.5h13M2.5 7h13M2.5 10.5h13M2.5 14h13M7 3.5V14" />,
  sound: <path d="M3 7v4h3l4 3V4L6 7zM12.5 6.5a3.5 3.5 0 0 1 0 5M14.5 4.5a6.5 6.5 0 0 1 0 9" />,
  mute: <path d="M3 7v4h3l4 3V4L6 7zM12.5 7l4 4M16.5 7l-4 4" />,
  bellRing: <path d="M9 2.5a4 4 0 0 0-4 4v3.5L3.5 12.5h11L13 10V6.5a4 4 0 0 0-4-4zM7.5 14.5a1.6 1.6 0 0 0 3 0M1.5 6a6 6 0 0 1 2-3.5M16.5 6a6 6 0 0 0-2-3.5" />,
  download: <path d="M9 2.5v9M5.5 8l3.5 3.5L12.5 8M3 15h12" />,
  upload: <path d="M9 11.5v-9M5.5 6L9 2.5 12.5 6M3 15h12" />,
  refresh: <path d="M14.5 8A5.5 5.5 0 1 0 13 12.5M14.5 3.5V8H10" />,
  flag: <path d="M4 16V2.5M4 3h9l-2 3 2 3H4" />,
  columns: <path d="M2.5 3.5h13v11h-13zM7 3.5v11M11 3.5v11" />,
  run: <path d="M5.5 3.5v11l9-5.5z" />,
  save: <path d="M3.5 3.5h9l2 2v9h-11zM6 3.5v4h5v-4M6 14.5v-4h6v4" />,
  file: <path d="M4.5 2.5h6l3 3v10h-9zM10.5 2.5v3h3" />,
  trash: <path d="M3.5 5h11M7 5V3.5h4V5M5 5l.8 10h6.4L13 5M7.5 8v4.5M10.5 8v4.5" />,
};

export function panelIcon(name: string, size = 18): ReactNode {
  // The 28×28 set (crisp art) wins where it has the icon.
  if (ICONS28[name]) return <Icon name={name} size={size} />;
  const p = PATHS[name];
  if (!p) return <Icon name={name} size={size} />;
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p}
    </svg>
  );
}
