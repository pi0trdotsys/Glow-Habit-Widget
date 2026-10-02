// Marks on a habit tile's ring: the progress head (a dot riding the end of the
// arc - it moves with every change, also when steps/water come in by
// themselves) and the minimum version (a thin tick, only until it's reached).

export interface RingMarks {
  /** Where the progress dot sits, 0..1 of the circle, or null (no progress / done). */
  head: number | null;
  /** Where the minimum tick sits, 0..1, or null (none, reached or done). */
  minTick: number | null;
}

export function ringMarks(p: {
  /** Shown progress 0..1 (includes the hold preview). */
  progress: number;
  amount: number;
  target: number;
  min: number;
  done: boolean;
  avoid: boolean;
}): RingMarks {
  if (p.avoid || p.done || p.target <= 0) return { head: null, minTick: null };
  const f = Math.max(0, Math.min(1, p.progress));
  return {
    head: f > 0 && f < 1 ? f : null,
    minTick: p.min > 0 && p.amount < p.min ? Math.min(1, p.min / p.target) : null,
  };
}

/** Point on the ring (svg rotated -90deg, so 0 = 12 o'clock). */
export function ringPoint(size: number, r: number, fraction: number): { x: number; y: number } {
  const a = 2 * Math.PI * fraction;
  return { x: size / 2 + r * Math.cos(a), y: size / 2 + r * Math.sin(a) };
}
