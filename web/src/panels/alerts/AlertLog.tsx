// Alert event log (newest first). Clicking an event marks it seen and loads its symbol.

import type { Alert, AlertEvent } from "@qt/core";
import { formatPrice } from "../../chart/format";
import { eventText } from "../../hooks/alerts";
import { formatAlertTime } from "./alertModel";

interface Props {
  events: AlertEvent[];
  alerts: Alert[];
  onOpen(e: AlertEvent): void;
}

export function AlertLog({ events, alerts, onOpen }: Props) {
  if (events.length === 0) return <div className="pn-empty">No alert events.</div>;
  const byId = new Map(alerts.map((a) => [a.id, a]));
  const list = [...events].reverse();
  return (
    <ul className="al-log" aria-label="Alert log">
      {list.map((e) => (
        <li
          key={e.id}
          className={`al-ev${e.seen ? "" : " unread"}`}
          tabIndex={0}
          data-event-id={e.id}
          onClick={() => onOpen(e)}
          onKeyDown={(k) => k.key === "Enter" && onOpen(e)}
        >
          <div className="al-ev-head">
            <span className="al-sym">{e.symbol}</span>
            <span className="num">{formatPrice(e.price)}</span>
            <span className="spacer" />
            <span className="muted">{formatAlertTime(e.time)}</span>
          </div>
          <div className="al-ev-msg">{eventText(e, byId.get(e.alertId))}</div>
        </li>
      ))}
    </ul>
  );
}
