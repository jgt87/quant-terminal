// Tools of the toolbar's bottom controls (measure).

import type { DrawingToolDef } from "../../types";
import { measure } from "./measure";
import { dateAndPriceRange, dateRange, priceRange } from "./ranges";

export const MEASURE: DrawingToolDef[] = [measure, priceRange, dateRange, dateAndPriceRange];
