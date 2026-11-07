// Provider limits the server reports with bars (BarsResponse.notices), for example "Deriv only
// keeps about one year of history". Each distinct notice is shown once per page load as a toast.

import { pushToast } from "../panels/common/toasts";

const shown = new Set<string>();

/** Toast every notice not shown yet; returns the ones shown now. */
export function showNotices(notices: readonly string[] | undefined): string[] {
  const fresh = (notices ?? []).filter((n) => typeof n === "string" && n && !shown.has(n));
  for (const n of fresh) {
    shown.add(n);
    pushToast({ title: "Data limit", body: n, tone: "info", ttl: 12_000 });
  }
  return fresh;
}

/** Forget what was shown (tests). */
export function resetNotices(): void {
  shown.clear();
}
