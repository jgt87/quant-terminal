// Modified Schiff pitchfork (catalog LineToolSchiffPitchfork). Modified Schiff: the median starts at the midpoint (time and price) of the first and second anchors.

import { PITCHFORK_VARIANT } from "@qt/core";
import { makePitchfork } from "./pitchforkTool";

export const modifiedSchiffPitchfork = makePitchfork({
  type: "modifiedSchiffPitchfork",
  catalogType: "LineToolSchiffPitchfork",
  label: "Modified Schiff pitchfork",
  variant: PITCHFORK_VARIANT.modifiedSchiff,
  iconPath: "M5.5 22.5L9.5 14.5h14M14.5 6.5v16M14.5 6.5h9M14.5 22.5h9",
  iconFill: "M5.5 25.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM14.5 9.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM14.5 25.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
});
