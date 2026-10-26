// Schiff pitchfork (catalog LineToolSchiffPitchfork2). Schiff: the median starts halfway (in price) between the first and second anchors.

import { PITCHFORK_VARIANT } from "@qt/core";
import { makePitchfork } from "./pitchforkTool";

export const schiffPitchfork = makePitchfork({
  type: "schiffPitchfork",
  catalogType: "LineToolSchiffPitchfork2",
  label: "Schiff pitchfork",
  variant: PITCHFORK_VARIANT.schiff,
  iconPath: "M5.5 22.5v-8h18M11.5 6.5v16M11.5 6.5h12M11.5 22.5h12",
  iconFill: "M5.5 25.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.5 9.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.5 25.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
});
