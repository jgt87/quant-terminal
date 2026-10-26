// Flat top/bottom (catalog LineToolFlatBottom): trend line a→b plus a horizontal line at the third
// anchor's price over the same time span, filled between.

import { flatLines } from "@qt/core";
import { makeTwoLineChannel } from "./twoLineChannel";

export const flatBottom = makeTwoLineChannel({
  type: "flatBottom",
  catalogType: "LineToolFlatBottom",
  label: "Flat top/bottom",
  menuName: "flat top/bottom",
  color: "#ff9800",
  // Rising trend line above a flat bottom line.
  iconPath: "M5.5 14.5L22.5 5.5M5.5 21.5h17",
  iconFill: "M5.5 17a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM22.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  lines: flatLines,
  dragSecond([a, b], end, to) {
    // Either end of the flat line sets its price and moves the matching end in time.
    return end === 0 ? [{ ...a, time: to.time }, b, { time: to.time, price: to.price }] : [a, { ...b, time: to.time }, { time: a.time, price: to.price }];
  },
});
