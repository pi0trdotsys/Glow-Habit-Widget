import { useState } from "react";
import { X } from "lucide-react";
import { addDays } from "date-fns";
import { useHabits } from "@/lib/habits/store";
import { formatMinute, todayKey } from "@/lib/habits/utils";
import {
  RESTED_SLEEP_MIN,
  SHORT_SLEEP_MIN,
  badNight,
  billComment,
  fellAfter,
  fellLine,
  fmtSleep,
  sleepMinutes,
  sleepRange,
  sleepWeeks,
} from "@/lib/night";
import { cleanNightStreak, nightDebt } from "@/lib/curfew";
import { isBank, rawNightDebt } from "@/lib/bank";
import { SZPILA_EMOJI } from "@/lib/habits/szpila";
import type { NightReport } from "@/lib/sensors";
import { L, intlLocale, plPlural } from "@/lib/i18n";

const DISMISS_KEY = "szpila-bill-dismissed";

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Fokus, mornings (until noon): what last night really looked like. */
/** Last night's bill while it's still morning (until noon) and not dismissed; null otherwise. */
export function useNightBill(
  now: Date = new Date(),
): { r: NightReport; dismiss: () => void } | null {
  const reports = useHabits((s) => s.nightReports);
  const key = todayKey(addDays(now, -1));
  const [dismissed, setDismissed] = useState(readDismissed);
  const r = reports[key];
  if (now.getHours() >= 12 || !r || dismissed === key) return null;
  return {
    r,
    dismiss: () => {
      try {
        localStorage.setItem(DISMISS_KEY, key);
      } catch {
        /* private mode */
      }
      setDismissed(key);
    },
  };
}

export function NightBillCard({ now = new Date() }: { now?: Date }) {
  const bill = useNightBill(now);
  return bill ? <NightBillView r={bill.r} onDismiss={bill.dismiss} /> : null;
}

/** The bill itself (Today's status card). */
export function NightBillView({ r, onDismiss }: { r: NightReport; onDismiss: () => void }) {
  const level = useHabits((s) => s.notifications.tauntLevel);
  const userName = useHabits((s) => s.userName);
  const reports = useHabits((s) => s.nightReports);
  const notif = useHabits((s) => s.notifications);
  const bad = badNight(r);
  const streak = cleanNightStreak(reports);
  // "Bank minut": the whole debt comes off the bank (no floor).
  const debt =
    notif.dailyLimit && (notif.nightDebt ?? true)
      ? isBank(notif)
        ? rawNightDebt(r)
        : nightDebt(r, notif.dailyLimitMin)
      : 0;

  return (
    <section
      className="relative h-full rounded-2xl p-3"
      data-night-bill
      style={{
        background: bad
          ? "color-mix(in oklab, var(--avoid) 10%, var(--card))"
          : "color-mix(in oklab, var(--primary) 8%, var(--card))",
        border: `1px solid color-mix(in oklab, ${bad ? "var(--avoid)" : "var(--primary)"} 24%, transparent)`,
      }}
    >
      <button
        aria-label={L("Zamknij rachunek za noc", "Close the night bill")}
        className="absolute right-2 top-2 rounded-full p-1 text-muted-foreground"
        onClick={onDismiss}
      >
        <X size={14} />
      </button>
      <div
        className="text-xs font-semibold"
        style={{ color: bad ? "var(--avoid)" : "var(--primary)" }}
      >
        🧾 {L("Rachunek za noc", "Night bill")}
      </div>
      <NightFacts r={r} />
      <p className="mt-2 text-[13px] leading-snug">
        {bad ? SZPILA_EMOJI.angry : SZPILA_EMOJI.impressed} {billComment(r, level, userName)}
      </p>
      {(streak > 0 || debt > 0) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs font-semibold">
          {streak > 0 && (
            <span data-clean-streak style={{ color: "var(--primary)" }}>
              🔥{" "}
              {L(
                `${streak} ${plPlural(streak, ["czysta noc", "czyste noce", "czystych nocy"])} z rzędu`,
                `${streak} clean ${streak === 1 ? "night" : "nights"} in a row`,
              )}
            </span>
          )}
          {debt > 0 && (
            <span data-bill-debt style={{ color: "var(--avoid)" }}>
              {L(`−${debt} min z dzisiejszego limitu`, `−${debt} min off today's limit`)}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

/** Apps + numbers of one night (shared by the card and the report list). */
export function NightFacts({ r }: { r: NightReport }) {
  return (
    <>
      {(r.apps?.length ?? 0) > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {r.apps!.map((a) => (
            <span
              key={a.pkg}
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "color-mix(in oklab, var(--avoid) 18%, transparent)" }}
            >
              {a.visits}× {a.label} · {a.minutes} min
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 text-xs text-muted-foreground">
          {L("Zero social mediów po północy.", "Zero social media after midnight.")}
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span>
          📱 {r.screen ?? 0} {L("min po północy", "min after midnight")}
        </span>
        {r.asleep != null && r.asleep >= 0 && (
          <span>
            🌙{" "}
            {L(`odłożony ok. ${formatMinute(r.asleep)}`, `phone down ~${formatMinute(r.asleep)}`)}
          </span>
        )}
      </div>
      <SleepFacts r={r} />
      {((r.charged ?? -1) >= 0 || (r.curfewBlocks ?? 0) > 0 || (r.unplugs ?? 0) > 0) && (
        <div
          className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground"
          data-curfew-facts
        >
          {(r.charged ?? -1) >= 0 && (
            <span>
              🔌 {L(`ładowarka ${formatMinute(r.charged!)}`, `charger ${formatMinute(r.charged!)}`)}
            </span>
          )}
          {(r.curfewBlocks ?? 0) > 0 && (
            <span>
              🚫{" "}
              {L(
                `cisza nocna: ${r.curfewBlocks}× blokada, ${r.curfewPasses ?? 0}× wyjątek`,
                `curfew: ${r.curfewBlocks}× blocked, ${r.curfewPasses ?? 0}× pass`,
              )}
            </span>
          )}
          {(r.unplugs ?? 0) > 0 && (
            <span>⚡ {L(`odłączony ${r.unplugs}×`, `unplugged ${r.unplugs}×`)}</span>
          )}
        </div>
      )}
    </>
  );
}

/** Sleep from the band: "😴 6 h 12 min snu (00:48–07:00)", stages, phone-down vs asleep. */
function SleepFacts({ r }: { r: NightReport }) {
  const minutes = sleepMinutes(r);
  if (minutes == null || !r.sleep) return null;
  const s = r.sleep;
  const fell = fellAfter(r);
  const stages =
    s.deep != null && s.rem != null
      ? L(
          `głęboki ${fmtSleep(s.deep)} · REM ${fmtSleep(s.rem)}`,
          `deep ${fmtSleep(s.deep)} · REM ${fmtSleep(s.rem)}`,
        )
      : null;
  return (
    <div className="mt-1 flex flex-wrap gap-x-4 text-xs text-muted-foreground" data-sleep-facts>
      <span
        className="font-medium"
        style={{
          color:
            minutes < SHORT_SLEEP_MIN
              ? "var(--avoid)"
              : minutes >= RESTED_SLEEP_MIN
                ? "var(--primary)"
                : undefined,
        }}
      >
        😴 {L(`${fmtSleep(minutes)} snu`, `${fmtSleep(minutes)} of sleep`)} ({sleepRange(r)})
      </span>
      {stages && <span>{stages}</span>}
      {fell != null && (
        <span data-sleep-fell style={fell < 0 ? { color: "var(--avoid)" } : undefined}>
          💤 {fellLine(r)}
        </span>
      )}
    </div>
  );
}

/** "Sen: śr. 6 h 40 min (7 nocy) · +12 min vs poprzednie 7" (NightList header). */
function SleepWeekStat() {
  const reports = useHabits((s) => s.nightReports);
  const w = sleepWeeks(reports);
  if (!w.last) return null;
  const d = w.delta;
  return (
    <div className="mb-2 text-xs text-muted-foreground" data-sleep-week>
      😴{" "}
      <span className="font-semibold text-foreground">
        {L(`Sen: śr. ${fmtSleep(w.last.avg)}`, `Sleep: avg ${fmtSleep(w.last.avg)}`)}
      </span>{" "}
      {L(
        `(${w.last.nights} ${plPlural(w.last.nights, ["noc", "noce", "nocy"])})`,
        `(${w.last.nights} ${w.last.nights === 1 ? "night" : "nights"})`,
      )}
      {d != null && (
        <span
          className="ml-1 font-semibold"
          style={{ color: d > 0 ? "var(--primary)" : d < 0 ? "var(--avoid)" : undefined }}
        >
          · {d > 0 ? "+" : d < 0 ? "−" : "±"}
          {fmtSleep(Math.abs(d))} {L("vs poprzednie 7", "vs the 7 before")}
        </span>
      )}
    </div>
  );
}

/** Report: the last nights, newest first. */
export function NightList({ max = 7 }: { max?: number }) {
  const reports = useHabits((s) => s.nightReports);
  const nights = Object.values(reports)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, max);
  if (nights.length === 0) return null;
  return (
    <section className="mx-5 mt-4 rounded-3xl bg-card p-5" data-night-list>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {L("Ostatnie noce", "Recent nights")}
      </h2>
      <SleepWeekStat />
      <ul className="divide-y divide-border">
        {nights.map((r) => (
          <li key={r.date} className="py-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">
                {new Date(`${r.date}T12:00:00`).toLocaleDateString(intlLocale(), {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })}{" "}
                {L("→ noc", "→ night")}
              </span>
              <span
                className="text-xs font-semibold"
                style={{ color: badNight(r) ? "var(--avoid)" : "var(--primary)" }}
              >
                {badNight(r) ? `${r.social} min social` : L("czysto", "clean")}
              </span>
            </div>
            <NightFacts r={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}
