import { useCallback, useEffect, useRef, useState } from "react";

/** How long a tile must be held to count. Mirrored by HoldActivity.HOLD_MS (widget overlay). */
export const HOLD_TO_COMPLETE_MS = 1200;
/** Keep holding this long (in total) to open the quick amount sheet instead. */
export const LONG_HOLD_MS = 2400;
/** Horizontal travel (px) that counts as a swipe (= undo the last entry). */
export const SWIPE_PX = 48;

interface Options {
  /** ms to fully complete the hold */
  duration?: number;
  /** invoked on full hold */
  onComplete: () => void;
  /** invoked on a short tap (released before duration) */
  onTap?: () => void;
  /** tap threshold ms */
  tapMaxMs?: number;
  /** keep holding past `duration` until `longDuration` -> onLongHold (the quick amount sheet) */
  longDuration?: number;
  onLongHold?: () => void;
  /** a sideways swipe on the element (undo) */
  onSwipe?: (dir: "left" | "right") => void;
}

/** Is this pointer movement a sideways swipe (not a scroll)? Exported for tests. */
export function isSwipe(dx: number, dy: number, threshold = SWIPE_PX): boolean {
  return Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/**
 * Long-press hook with live progress.
 * - Tap (released before tapMaxMs) -> onTap
 * - Held to `duration` -> onComplete (progress 0..1)
 * - Still held to `longDuration` -> onLongHold (phase2 0..1 in between)
 * - Sideways swipe -> onSwipe (the hold is cancelled)
 */
export function useHoldToComplete({
  duration = HOLD_TO_COMPLETE_MS,
  onComplete,
  onTap,
  tapMaxMs = 200,
  longDuration = LONG_HOLD_MS,
  onLongHold,
  onSwipe,
}: Options) {
  const [progress, setProgress] = useState(0);
  const [phase2, setPhase2] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const [dx, setDx] = useState(0);
  const startRef = useRef<number | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const firedRef = useRef(false);
  const longFiredRef = useRef(false);
  const swipedRef = useRef(false);

  const cancel = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startRef.current = null;
    posRef.current = null;
    setIsHolding(false);
    setProgress(0);
    setPhase2(0);
    setDx(0);
  }, []);

  const tick = useCallback(() => {
    if (startRef.current == null) return;
    const elapsed = performance.now() - startRef.current;
    setProgress(Math.min(1, elapsed / duration));
    if (elapsed >= duration && !firedRef.current) {
      firedRef.current = true;
      onComplete();
      if (!onLongHold) {
        cancel();
        return;
      }
    }
    if (onLongHold && firedRef.current) {
      const p2 = Math.min(1, (elapsed - duration) / Math.max(1, longDuration - duration));
      setPhase2(p2);
      if (p2 >= 1 && !longFiredRef.current) {
        longFiredRef.current = true;
        onLongHold();
        cancel();
        return;
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [duration, longDuration, onComplete, onLongHold, cancel]);

  const start = useCallback(
    (x: number, y: number) => {
      firedRef.current = false;
      longFiredRef.current = false;
      swipedRef.current = false;
      startRef.current = performance.now();
      posRef.current = { x, y };
      setIsHolding(true);
      rafRef.current = requestAnimationFrame(tick);
    },
    [tick],
  );

  const end = useCallback(() => {
    if (startRef.current == null) return;
    const elapsed = performance.now() - startRef.current;
    cancel();
    if (elapsed < tapMaxMs && onTap && !swipedRef.current) onTap();
  }, [cancel, onTap, tapMaxMs]);

  useEffect(() => () => cancel(), [cancel]);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      start(e.clientX, e.clientY);
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = posRef.current;
      if (!p || swipedRef.current) return;
      const mx = e.clientX - p.x;
      const my = e.clientY - p.y;
      if (onSwipe && !firedRef.current) setDx(Math.abs(mx) > Math.abs(my) ? mx : 0);
      if (onSwipe && !firedRef.current && isSwipe(mx, my)) {
        swipedRef.current = true;
        cancel();
        onSwipe(mx < 0 ? "left" : "right");
        return;
      }
      // A vertical drag is a scroll: stop holding.
      if (Math.abs(my) > 14 && Math.abs(my) > Math.abs(mx)) cancel();
    },
    onPointerUp: (e: React.PointerEvent) => {
      (e.target as Element).releasePointerCapture?.(e.pointerId);
      end();
    },
    onPointerLeave: () => cancel(),
    onPointerCancel: () => cancel(),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { handlers, progress, phase2, isHolding, dx };
}
