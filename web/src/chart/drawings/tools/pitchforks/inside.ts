// Inside pitchfork (catalog LineToolInsidePitchfork). Inside: a half-width fork whose tines pass through the midpoints of the first anchor and the other two.

import { PITCHFORK_VARIANT } from "@qt/core";
import { makePitchfork } from "./pitchforkTool";

export const insidePitchfork = makePitchfork({
  type: "insidePitchfork",
  catalogType: "LineToolInsidePitchfork",
  label: "Inside pitchfork",
  variant: PITCHFORK_VARIANT.inside,
  iconPath: "M5.5 14.5h18M5.5 14.5l6-8M5.5 14.5l6 8M8.5 10.5v8M8.5 10.5h15M8.5 18.5h15",
  iconFill: "M5.5 17.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.5 9.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM11.5 25.0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
});
