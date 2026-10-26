// Entry points for the chart: "Add alert on <price>" and "Add alert on this drawing" open the
// alert dialog (in the Alerts panel) prefilled for the chart's symbol and interval.

import type { Interval } from "@qt/core";
import { alertDialogRequests, openPanelRequests } from "../bus";
import { draftFromChart, type ChartAlertTarget } from "./alertModel";

export type { ChartAlertTarget };

export function createAlertFromChart(symbol: string, interval: Interval, target: ChartAlertTarget): void {
  openPanelRequests.emit("alerts");
  alertDialogRequests.emit(draftFromChart(symbol, interval, target));
}

/** Menu label for a price target, e.g. "Add alert on 187.25". */
export { formatPrice as alertPriceLabel } from "../../chart/format";
