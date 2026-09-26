import { useCallback, useEffect, useRef, useState } from "react";

/** How long a tile must be held to count. Mirrored by HoldActivity.HOLD_MS (widget overlay). */
export const HOLD_TO_COMPLETE_MS = 1200;

interface Options {
  /** ms to fully complete the hold */
  duration?: number;
  /** invoked on full hold */
  onComplete: () => void;
  /** invoked on a short tap (released before duration) */
  onTap?: () => void;
  /** tap threshold ms */
  tapMaxMs?: number;
}

/**
 * Long-press hook with live progress (0..1).
 * - Tap (released before duration) -> onTap
 * - Held to completion -> onComplete + vibration
 */
export function useHoldToComplete({
  duration = HOLD_TO_COMPLETE_MS,
  onComplete,
  onTap,
  tapMaxMs = 200,
}: Options) {
  const [progress, setProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);

  const cancel = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    setIsHolding(false);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current == null) return;
    const elapsed = performance.now() - startRef.current;
    const p = Math.min(1, elapsed / duration);
    setProgress(p);
    if (p >= 1) {
      if (!firedRef.current) {
        firedRef.current = true;
        try {
          if (typeof navigator !== "undefined" && "vibrate" in navigator) {
            navigator.vibrate?.(30);
          }
        } catch {
          /* ignore */
        }
        onComplete();
      }
      cancel();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, onComplete, cancel]);

  const start = useCallback(() => {
    firedRef.current = false;
    startRef.current = performance.now();
    setIsHolding(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  const end = useCallback(() => {
    if (startRef.current == null) return;
    const elapsed = performance.now() - startRef.current;
    cancel();
    if (elapsed < tapMaxMs && onTap) onTap();
  }, [cancel, onTap, tapMaxMs]);

  useEffect(() => () => cancel(), [cancel]);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      start();
    },
    onPointerUp: (e: React.PointerEvent) => {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      end();
    },
    onPointerLeave: () => cancel(),
    onPointerCancel: () => cancel(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { handlers, progress, isHolding };
}