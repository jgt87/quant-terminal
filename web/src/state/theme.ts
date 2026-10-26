// Active UI theme (dark / light), provided by the app shell to components that paint canvases.

import { createContext, useContext } from "react";
import type { ThemeMode } from "../chart/theme";

export const ThemeContext = createContext<ThemeMode>("dark");

export function useThemeMode(): ThemeMode {
  return useContext(ThemeContext);
}
