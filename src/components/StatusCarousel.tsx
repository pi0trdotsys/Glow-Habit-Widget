import { useEffect, useRef, useState, type ReactNode } from "react";
import { SzpilaBubble } from "./Szpila";
import { NightBillView, useNightBill } from "./NightBill";
import { MorningLockCard, SocialTodayCard, useGuardStatus } from "./TodayGuard";
import type { SzpilaSay } from "@/lib/habits/szpila";
import { L } from "@/lib/i18n";

export type SlideId = "morning" | "bill" | "szpila" | "social";

/**
 * Order of Today's status slides: what needs you first (the morning lock),
 * then last night's bill (mornings), Szpila, and today's social media minutes.
 */
export function statusSlideIds(has: {
  morning: boolean;
  bill: boolean;
  social: boolean;
}): SlideId[] {
  const out: SlideId[] = [];
  if (has.morning) out.push("morning");
  if (has.bill) out.push("bill");
  out.push("szpila");
  if (has.social) out.push("social");
  return out;
}

/**
 * The cat reacts to progress: a completed step makes it pleased for a moment
 * (and hop), a complete day keeps it pleased. Exported for tests.
 */
export function reactiveMood(
  say: SzpilaSay["mood"],
  reacting: boolean,
  allDone: boolean,
): SzpilaSay["mood"] {
  if (allDone || reacting) return "impressed";
  return say;
}

/**
 * One swipeable card at the top of Today instead of a stack: the morning
 * lock, the night bill, Szpila's jab and the social media limit - side by
 * side, with dots. Keeps the habits visible without scrolling.
 */
export function StatusCarousel({
  say,
  onReroll,
  now,
  doneCount,
  allDone,
  force = false,
}: {
  say: SzpilaSay;
  onReroll: () => void;
  now: Date;
  /** Habits done today - a rise makes the cat react. */
  doneCount: number;
  allDone: boolean;
  /** Show the guard slides outside the native app (tests). */
  force?: boolean;
}) {
  const bill = useNightBill(now);
  const guard = useGuardStatus(now, force);
  const ids = statusSlideIds({
    morning: guard.morning.length > 0,
    bill: !!bill,
    social: !!guard.social,
  });
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  // The cat's reaction to a completed step.
  const [reacting, setReacting] = useState(false);
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > prevDone.current) {
      setReacting(true);
      const t = setTimeout(() => setReacting(false), 1600);
      prevDone.current = doneCount;
      return () => clearTimeout(t);
    }
    prevDone.current = doneCount;
  }, [doneCount]);

  const mood = reactiveMood(say.mood, reacting, allDone);
  const slides: Record<SlideId, ReactNode> = {
    morning: <MorningLockCard pending={guard.morning} />,
    bill: bill ? <NightBillView r={bill.r} onDismiss={bill.dismiss} /> : null,
    szpila: <SzpilaBubble say={{ ...say, mood }} onReroll={onReroll} hop={reacting} />,
    social: guard.social ? <SocialTodayCard {...guard.social} /> : null,
  };

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const go = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div data-status-carousel data-slides={ids.join(",")}>
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory items-stretch overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {ids.map((id) => (
          <div key={id} data-slide={id} className="w-full shrink-0 snap-center snap-always">
            {slides[id]}
          </div>
        ))}
      </div>
      {ids.length > 1 && (
        <div
          className="mt-2 flex justify-center gap-1.5"
          role="tablist"
          aria-label={L("Karty stanu", "Status cards")}
        >
          {ids.map((id, i) => (
            <button
              key={id}
              role="tab"
              aria-selected={i === active}
              aria-label={`${i + 1}/${ids.length}`}
              onClick={() => go(i)}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === active ? 18 : 8,
                backgroundColor: i === active ? "var(--foreground)" : "var(--border)",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
