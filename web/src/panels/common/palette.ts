// Categorical series colors as theme tokens (CSS custom properties), so SVG charts follow the theme.

import palette from "./palette.json";

export const SERIES_TOKENS = palette.series;

/** CSS color for the i-th series, e.g. "var(--link-blue)". */
export const seriesColor = (i: number) => `var(${SERIES_TOKENS[i % SERIES_TOKENS.length]})`;
