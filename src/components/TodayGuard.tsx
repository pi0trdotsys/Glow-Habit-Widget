import { Capacitor } from "@capacitor/core";
import { Lock, Smartphone } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { morningPending, morningWindow } from "@/lib/day-guard";
import { minuteOfDay, todayKey } from "@/lib/habits/utils";
import { nightDebt } from "@/lib/curfew";
import { addDays } from "date-fns";
import { L } from "@/lib/i18n";

export interface GuardStatus {
  /** Morning habits still blocking social media (empty = no lock right now). */
  morning: Habit[];
  /** Today's social media minutes vs the daily limit (null = limit off / no data yet). */
  social: { used: number; limit: number; over: boolean; debt: number } | null;
}

/**
 * What the guard has to say on Today (native only - on the web nothing is
 * guarded). `force` shows it outside the native app (tests / previews).
 */
export function useGuardStatus(now: Date, force = false): GuardStatus {
  const notif = useHabits((s) => s.notifications);
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const daySocial = useHabits((s) => s.daySocial);
  const reports = useHabits((s) => s.nightReports);
  if (!force && !Capacitor.isNativePlatform()) return { morning: [], social: null };
  const morning = morningWindow(notif, minuteOfDay(now))
    ? morningPending(notif, habits, completions, now)
    : [];
  const used = daySocial[todayKey(now)];
  // "Noc kosztuje dzień": last night's scrolling comes off today's limit (mirrors DayGuard.debt).
  const debt =
    (notif.nightDebt ?? true) && now.getHours() >= 5
      ? nightDebt(reports[todayKey(addDays(now, -1))] ?? null, notif.dailyLimitMin)
      : 0;
  const limit = notif.dailyLimitMin - debt;
  const social =
    notif.dailyLimit && used != null ? { used, limit, over: used > limit, debt } : null;
  return { morning, social };
}

/** Morning lock: "najpierw zadania, potem social media". */
export function MorningLockCard({ pending }: { pending: Habit[] }) {
  const until = useHabits((s) => s.notifications.morningUntil);
  return (
    <section
      data-morning-lock
      className="flex h-full items-start gap-2.5 rounded-2xl p-3"
      style={{
        background: "color-mix(in oklab, var(--avoid) 10%, var(--card))",
        border: "1px solid color-mix(in oklab, var(--avoid) 26%, transparent)",
      }}
    >
      <Lock size={17} className="mt-0.5 shrink-0" style={{ color: "var(--avoid)" }} />
      <div className="min-w-0 text-sm leading-snug">
        <span className="font-semibold">{L("Rano najpierw: ", "Mornings, first: ")}</span>
        {pending.map((h) => h.name).join(", ")}
        <div className="mt-0.5 text-xs text-muted-foreground">
          {L(
            `Do tego czasu social media są zablokowane (najdłużej do ${until}).`,
            `Until then social media stays blocked (until ${until} at the latest).`,
          )}
        </div>
      </div>
    </section>
  );
}

/** Today's social media minutes against the daily limit. */
export function SocialTodayCard({
  used,
  limit,
  over,
  debt = 0,
}: {
  used: number;
  limit: number;
  over: boolean;
  /** Minutes last night took off today's limit. */
  debt?: number;
}) {
  return (
    <section
      data-social-today
      className="flex h-full flex-col justify-center rounded-2xl bg-card px-3 py-2.5"
    >
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Smartphone size={15} /> {L("Social media dziś", "Social media today")}
        </span>
        <span
          className="font-semibold tabular-nums"
          style={{ color: over ? "var(--avoid)" : undefined }}
        >
          {used}/{limit} min
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-background">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.min(100, (used / Math.max(1, limit)) * 100)}%`,
            backgroundColor: over ? "var(--avoid)" : "var(--primary)",
          }}
        />
      </div>
      <div className="mt-1.5 text-xs text-muted-foreground">
        {over
          ? L(`Limit przekroczony o ${used - limit} min.`, `Over the limit by ${used - limit} min.`)
          : L(`Zostało ${limit - used} min.`, `${limit - used} min left.`)}
        {debt > 0 && (
          <span data-night-debt style={{ color: "var(--avoid)" }}>
            {L(` Noc zabrała ${debt} min.`, ` Last night cost ${debt} min.`)}
          </span>
        )}
      </div>
    </section>
  );
}
