// Android back button inside the app. MainActivity.java calls window.__loopBack()
// first: the most recently opened thing (edit form, bottom sheet, expanded plan)
// closes and the press is consumed. If nothing is open, the WebView goes back a
// screen, and only on the first screen does the app exit.
import { useEffect, useRef } from "react";

type Handler = { current: () => void };
const stack: Handler[] = [];

/** Register a close handler; returns its unregister function. Last registered closes first. */
export function pushBackHandler(handler: Handler): () => void {
  stack.push(handler);
  return () => {
    const i = stack.lastIndexOf(handler);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Called by MainActivity on system back. True = something was closed (press consumed). */
export function handleBack(): boolean {
  const top = stack.pop();
  if (!top) return false;
  top.current();
  return true;
}

if (typeof window !== "undefined") {
  (window as unknown as { __loopBack?: () => boolean }).__loopBack = handleBack;
}

/** While `active`, the back button calls `onBack` instead of leaving the screen. */
export function useBackHandler(active: boolean, onBack: () => void): void {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    return pushBackHandler(ref);
  }, [active]);
}
