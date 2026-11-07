// Countdown to the close of the forming bar, shown under the last price label.

/** End of the bar that starts at `start` (UTC seconds): calendar month for monthly bars, else start + interval. */
export function barEnd(start: number, intervalSec: number, monthly: boolean): number {
  if (!monthly) return start + intervalSec;
  const d = new Date(start * 1000);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) / 1000;
}

/** "45", "04:05", "1:04:05", "3d 04h": the shortest form that shows the remaining time. */
export function formatRemaining(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${two(h)}h`;
  if (h > 0) return `${h}:${two(m)}:${two(r)}`;
  return `${two(m)}:${two(r)}`;
}

/**
 * Time left in the last bar, or null when there is nothing to count down: no bars, an unknown
 * interval, or a bar that has already closed (market closed, delayed or stale data).
 */
export function barCountdown(lastBarTime: number | undefined, intervalSec: number, nowSec: number, monthly = false): string | null {
  if (lastBarTime === undefined || !(intervalSec > 0)) return null;
  const left = barEnd(lastBarTime, intervalSec, monthly) - nowSec;
  if (left <= 0 || left > (monthly ? 31 * 86400 : intervalSec)) return null;
  return formatRemaining(left);
}
