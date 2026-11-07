// Go to date (Alt+G): scrolls the chart to the bar at a date, and time on intraday charts.
// Older than the loaded history, the chart loads more until it gets there.

import { useState } from "react";
import { utcToFields, wallToUtc } from "../chart/goToDate";
import { Dialog } from "./Dialog";

interface Props {
  /** Time zone the fields are in (resolved IANA zone or "UTC"). */
  zone: string;
  intraday: boolean;
  /** Fields start at this time (UTC seconds), usually the bar in the middle of the chart. */
  initial: number;
  onGo(utcSec: number): void;
  onClose(): void;
}

export function GoToDateDialog({ zone, intraday, initial, onGo, onClose }: Props) {
  const start = utcToFields(initial, zone);
  const [date, setDate] = useState(start.date);
  const [time, setTime] = useState(start.time);
  const utc = wallToUtc(date, intraday ? time : "", zone);
  const submit = () => {
    if (utc === null) return;
    onGo(utc);
    onClose();
  };
  return (
    <Dialog
      title="Go to date"
      onClose={onClose}
      width={320}
      footer={
        <>
          <span className="spacer" />
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={submit} disabled={utc === null}>
            Go to
          </button>
        </>
      }
    >
      <form
        className="goto-date"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input className="text-input" type="date" autoFocus aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        {intraday && <input className="text-input" type="time" aria-label="Time" value={time} onChange={(e) => setTime(e.target.value)} />}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
