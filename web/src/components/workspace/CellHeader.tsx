// Thin header of a grid cell: symbol and interval, link-group button, maximize/restore.

import type { LinkColor, LinkGroup } from "@qt/core";
import { Icon } from "../icons";
import { LinkButton } from "./LinkButton";

interface Props {
  symbol: string;
  interval: string;
  link?: LinkColor;
  linkGroups: LinkGroup[];
  maximized: boolean;
  onLink(color: LinkColor | undefined): void;
  onGroup(group: LinkGroup): void;
  onMaximize(): void;
}

export function CellHeader(p: Props) {
  return (
    <div className="cell-head">
      <LinkButton color={p.link} groups={p.linkGroups} onPick={p.onLink} onGroup={p.onGroup} />
      <span className="cell-title">
        <strong>{p.symbol}</strong>
        <span className="cell-interval">{p.interval}</span>
      </span>
      <span className="spacer" />
      <button
        className="cell-btn"
        title={p.maximized ? "Restore grid (Alt+Enter)" : "Maximize chart (Alt+Enter)"}
        aria-label={p.maximized ? "Restore grid" : "Maximize chart"}
        onClick={p.onMaximize}
      >
        <Icon name={p.maximized ? "restore" : "maximize"} size={14} />
      </button>
    </div>
  );
}
