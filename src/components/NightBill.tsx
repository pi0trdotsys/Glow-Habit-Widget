import { useState } from "react";
import { X } from "lucide-react";
import { addDays } from "date-fns";
import { useHabits } from "@/lib/habits/store";
import { formatMinute, todayKey } from "@/lib/habits/utils";
import { badNight, billComment } from "@/lib/night";
import { SZPILA_EMOJI } from "@/lib/habits/szpila";
import type { NightReport } from "@/lib/sensors";
import { L, intlLocale } from "@/lib/i18n";

const DISMISS_KEY = "szpila-bill-dismissed";

function readDismissed(): string {
  try {
    return localStorage.getItem(DISMISS_KEY) ?? "";
  } catch {
    return "";
  }
}

/** Fokus, mornings (until noon): what last night really looked like. */
export function NightBillCard({ now = new Date() }: { now?: Date }) {
  const reports = useHabits((s) => s.nightReports);
  const level = useHabits((s) => s.notifications.tauntLevel);
  const userName = useHabits((s) => s.userName);
  const key = todayKey(addDays(now, -1));
  const [dismissed, setDismissed] = useState(readDismissed);
  const r = reports[key];
  if (now.getHours() >= 12 || !r || dismissed === key) return null;
  const bad = badNight(r);

  return (
    <section
      className="relative rounded-2xl p-3"
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
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, key);
          } catch {
            /* private mode */
          }
          setDismissed(key);
        }}
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
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: "color-mix(in oklab, var(--avoid) 18%, transparent)" }}
            >
              {a.visits}× {a.label} · {a.minutes} min
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-1.5 text-[11px] text-muted-foreground">
          {L("Zero social mediów po północy.", "Zero social media after midnight.")}
        </div>
      )}
      <div className="mt-2 flex gap-4 text-[11px] text-muted-foreground">
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
    </>
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
