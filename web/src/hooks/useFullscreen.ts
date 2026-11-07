// Full screen for the whole workspace (the browser's Fullscreen API on the page). Esc leaves it
// too (the browser handles that), so the state follows the document's fullscreenchange events.

import { useCallback, useEffect, useState } from "react";

export function useFullscreen(): { fullscreen: boolean; toggle(): void; supported: boolean } {
  const supported = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  const [fullscreen, setFullscreen] = useState(() => typeof document !== "undefined" && !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  return { fullscreen, toggle, supported };
}
