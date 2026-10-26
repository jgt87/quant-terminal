// Pitchfork (catalog LineToolPitchfork). Original: the median starts at the first anchor and runs through the midpoint of the other two.

import { PITCHFORK_VARIANT } from "@qt/core";
import { makePitchfork } from "./pitchforkTool";

export const pitchfork = makePitchfork({
  type: "pitchfork",
  catalogType: "LineToolPitchfork",
  label: "Pitchfork",
  variant: PITCHFORK_VARIANT.original,
  iconPath: "M5.5 14.5h18M11.5 6.5v16M11.5 6.5h12M11.5 22.5h12",
  iconFill: "M5.5 17.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.5 9.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.5 25.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
});
