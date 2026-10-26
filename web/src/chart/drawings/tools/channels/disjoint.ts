// Disjoint channel (catalog LineToolDisjointAngle): line a→b and a second line with the mirrored
// slope starting at the third anchor's price (a widening or narrowing channel).

import { disjointLines } from "@qt/core";
import { makeTwoLineChannel } from "./twoLineChannel";

export const disjointChannel = makeTwoLineChannel({
  type: "disjointChannel",
  catalogType: "LineToolDisjointAngle",
  label: "Disjoint channel",
  menuName: "disjoint channel",
  color: "#089981",
  // Two lines diverging to the right, anchor dots on the left ends.
  iconPath: "M5.5 11.5L22.5 4.5M5.5 16.5L22.5 23.5",
  iconFill: "M5.5 14a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM5.5 19a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  lines: disjointLines,
  dragSecond([a, b, c], end, to) {
    const dp = b.price - a.price;
    // Start: the third anchor's price. End: the mirrored end sets the price and the shared end time.
    if (end === 0) return [a, b, { time: a.time, price: to.price }];
    return [a, { ...b, time: to.time }, { time: a.time, price: to.price + dp }];
  },
});
