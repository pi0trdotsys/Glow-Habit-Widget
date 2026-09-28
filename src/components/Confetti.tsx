import { useEffect, useRef } from "react";

const COLORS = ["#ff4d5e", "#60e7b4", "#fdba2f", "#b180fc", "#55c4fe", "#ff7d9c", "#a9e85e"];

export interface Piece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

/** A burst of pieces from the top centre (deterministic for a given random source - tests). */
export function makePieces(n: number, width: number, rnd: () => number = Math.random): Piece[] {
  return Array.from({ length: n }, () => ({
    x: width / 2 + (rnd() - 0.5) * width * 0.3,
    y: -10,
    vx: (rnd() - 0.5) * 9,
    vy: 3 + rnd() * 6,
    size: 5 + rnd() * 6,
    rot: rnd() * Math.PI,
    vr: (rnd() - 0.5) * 0.3,
    color: COLORS[Math.floor(rnd() * COLORS.length)],
  }));
}

/** One animation step (gravity + drag). Exported for tests. */
export function stepPiece(p: Piece): Piece {
  return {
    ...p,
    x: p.x + p.vx,
    y: p.y + p.vy,
    vx: p.vx * 0.99,
    vy: p.vy + 0.18,
    rot: p.rot + p.vr,
  };
}

/**
 * Full-screen confetti for a complete day. Renders nothing until `fire`
 * changes to a new value; respects "reduce motion".
 */
export function Confetti({ fire }: { fire: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire) return;
    if (typeof window === "undefined") return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);
    let pieces = makePieces(140, w);
    let raf = 0;
    const started = performance.now();
    const frame = () => {
      ctx.clearRect(0, 0, w, h);
      pieces = pieces.map(stepPiece).filter((p) => p.y < h + 20);
      for (const p of pieces) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (pieces.length && performance.now() - started < 4000) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [fire]);
  return (
    <canvas
      ref={ref}
      data-confetti={fire || undefined}
      className="pointer-events-none fixed inset-0 z-[60] h-full w-full"
      aria-hidden
    />
  );
}
