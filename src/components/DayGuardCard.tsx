import { Capacitor } from "@capacitor/core";
import { Minus, Plus, Sunrise } from "lucide-react";
import { Toggle } from "@/components/HabitForm";
import { useHabits } from "@/lib/habits/store";
import { refreshNative } from "@/lib/widget/bridge";
import { autoMorningHabits, morningHabitIds } from "@/lib/day-guard";
import { kindOf, todayKey } from "@/lib/habits/utils";
import { L } from "@/lib/i18n";
import { bankHowTo, bankToday, isBank } from "@/lib/bank";

const LIMITS = [15, 30, 45, 60, 90, 120, 180];
// "Bank minut" rules (src/lib/bank.ts).
const BASES = [0, 5, 10, 15, 30];
const PER_HABIT = [5, 10, 15, 20, 30];
const PER_K_STEPS = [0, 2, 5, 10];
const CAPS = [30, 60, 90, 120, 180, 240];

/** The next value of a fixed list (an off-list value snaps to the nearest step). */
function stepIn(list: number[], value: number, d: number): number {
  let i = list.indexOf(value);
  if (i < 0) {
    i = list.findIndex((v) => v > value);
    if (i < 0) i = list.length;
    if (d > 0) i -= 1;
  }
  return list[Math.min(list.length - 1, Math.max(0, i + d))];
}

function Stepper({
  label,
  value,
  unit,
  list,
  onChange,
  data,
}: {
  label: string;
  value: number;
  unit: string;
  list: number[];
  onChange: (v: number) => void;
  data?: string;
}) {
  return (
    <div className="mt-3 flex items-center justify-between" data-stepper={data}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <button
          aria-label={L("Mniej", "Less")}
          onClick={() => onChange(stepIn(list, value, -1))}
          className="grid h-8 w-8 place-items-center rounded-full border border-border"
        >
          <Minus size={14} />
        </button>
        <span className="w-16 text-center text-sm font-semibold tabular-nums">
          {value} {unit}
        </span>
        <button
          aria-label={L("Więcej", "More")}
          onClick={() => onChange(stepIn(list, value, 1))}
          className="grid h-8 w-8 place-items-center rounded-full border border-border"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

/** Settings: the guard during the day - morning lock + daily social media limit (Android). */
export function DayGuardCard() {
  const notif = useHabits((s) => s.notifications);
  const setNotifications = useHabits((s) => s.setNotifications);
  const habits = useHabits((s) => s.habits);
  const daySocial = useHabits((s) => s.daySocial);
  const completions = useHabits((s) => s.completions);
  const reports = useHabits((s) => s.nightReports);
  if (!Capacitor.isNativePlatform()) return null;

  const update = (patch: Partial<typeof notif>) => {
    setNotifications({ ...notif, ...patch });
    refreshNative();
  };
  const builds = habits.filter((h) => kindOf(h) === "build");
  const chosen = new Set(morningHabitIds(notif, habits));
  const auto = notif.morningHabits == null;
  const used = daySocial[todayKey()] ?? 0;
  const bankOn = isBank(notif);
  const bank = bankOn ? bankToday(notif, habits, completions, reports, used) : null;
  const todayLimit = bank ? bank.limit : notif.dailyLimitMin;
  const idx = Math.max(0, LIMITS.indexOf(notif.dailyLimitMin));
  const step = (d: number) => {
    const i = LIMITS.indexOf(notif.dailyLimitMin);
    const next = LIMITS[Math.min(LIMITS.length - 1, Math.max(0, (i < 0 ? idx : i) + d))];
    update({ dailyLimitMin: next });
  };

  return (
    <div className="rounded-2xl bg-card p-4" data-day-guard>
      <div className="flex items-center gap-3">
        <Sunrise size={18} style={{ color: "var(--avoid)" }} />
        <span className="font-medium">{L("Social media w dzień", "Social media by day")}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {L("Rano najpierw zadania", "Mornings: habits first")}
          </div>
          <div className="text-xs text-muted-foreground">
            {L(
              `Od 5:00 do ${notif.morningUntil} social media są zablokowane, dopóki nie odhaczysz porannych zadań. Odhaczysz je prosto z blokady.`,
              `From 5:00 to ${notif.morningUntil} social media stays blocked until you tick off your morning habits - right from the block.`,
            )}
          </div>
        </div>
        <Toggle checked={notif.morningLock} onChange={(on) => update({ morningLock: on })} />
      </div>
      {notif.morningLock && (
        <>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{L("Blokada do", "Locked until")}</span>
            <input
              type="time"
              value={notif.morningUntil}
              onChange={(e) => e.target.value && update({ morningUntil: e.target.value })}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none"
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {L("Poranne zadania", "Morning habits")}
            </span>
            <button
              onClick={() => update({ morningHabits: auto ? [...chosen] : null })}
              className="text-xs font-semibold"
              style={{ color: auto ? "var(--primary)" : "var(--muted-foreground)" }}
            >
              {auto
                ? L("✓ Automatycznie", "✓ Automatic")
                : L("Wróć do automatu", "Back to automatic")}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2" data-morning-habits>
            {builds.map((h) => {
              const on = chosen.has(h.id);
              return (
                <button
                  key={h.id}
                  aria-pressed={on}
                  onClick={() => {
                    const base = auto ? autoMorningHabits(habits) : (notif.morningHabits ?? []);
                    update({
                      morningHabits: on ? base.filter((id) => id !== h.id) : [...base, h.id],
                    });
                  }}
                  className="rounded-full border px-3 py-1 text-xs font-medium transition"
                  style={{
                    borderColor: on ? "var(--avoid)" : "var(--border)",
                    backgroundColor: on
                      ? "color-mix(in oklab, var(--avoid) 16%, transparent)"
                      : "transparent",
                    color: on ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {on ? "✓ " : ""}
                  {h.name}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {L(
              "Wystarczy pierwsza porcja: poranne mycie zębów, pierwsza szklanka wody.",
              "The first unit is enough: the morning brush, the first glass of water.",
            )}
          </p>
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{L("Dzienny limit", "Daily limit")}</div>
          <div className="text-xs text-muted-foreground">
            {L(
              "Po przekroczeniu Szpila szpiluje też w dzień, a po 3. szpili blokuje. Dziś: ",
              "Past it Szpila jabs by day too, and blocks after the 3rd jab. Today: ",
            )}
            <span
              className="font-semibold"
              style={{ color: used > todayLimit ? "var(--avoid)" : undefined }}
            >
              {used}/{todayLimit} min
            </span>
          </div>
        </div>
        <Toggle checked={notif.dailyLimit} onChange={(on) => update({ dailyLimit: on })} />
      </div>
      {notif.dailyLimit && (
        <div
          className="mt-3 flex rounded-full bg-background p-1 text-xs font-semibold"
          data-limit-mode
        >
          {(
            [
              ["bank", L("💰 Bank minut", "💰 Minute bank")],
              ["fixed", L("Stały limit", "Fixed limit")],
            ] as const
          ).map(([mode, label]) => {
            const on = (mode === "bank") === bankOn;
            return (
              <button
                key={mode}
                aria-pressed={on}
                onClick={() => update({ limitMode: mode })}
                className="flex-1 rounded-full px-3 py-1.5 transition"
                style={{
                  backgroundColor: on ? "var(--card)" : "transparent",
                  color: on ? "var(--foreground)" : "var(--muted-foreground)",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}
      {notif.dailyLimit && bank && (
        <div data-bank-settings>
          <p className="mt-2 text-xs text-muted-foreground">
            {L(
              `Social media trzeba zarobić: na start ${bank.rules.base} min, ${bankHowTo(bank.rules)}, najwyżej ${bank.rules.cap} min dziennie. Noc dalej kosztuje. Dziś w banku: ${bank.left} min (zarobione ${bank.earned}, wydane ${used}).`,
              `Social media has to be earned: ${bank.rules.base} min to start, ${bankHowTo(bank.rules)}, at most ${bank.rules.cap} min a day. Nights still cost. In the bank today: ${bank.left} min (earned ${bank.earned}, spent ${used}).`,
            )}
          </p>
          <Stepper
            data="base"
            label={L("Na start dnia", "To start the day")}
            value={bank.rules.base}
            unit="min"
            list={BASES}
            onChange={(v) => update({ bankBase: v })}
          />
          <Stepper
            data="habit"
            label={L("Za każde zadanie", "Per habit")}
            value={bank.rules.perHabit}
            unit="min"
            list={PER_HABIT}
            onChange={(v) => update({ bankPerHabit: v })}
          />
          <Stepper
            data="steps"
            label={L("Za 1000 kroków", "Per 1000 steps")}
            value={bank.rules.perKSteps}
            unit="min"
            list={PER_K_STEPS}
            onChange={(v) => update({ bankPerKSteps: v })}
          />
          <Stepper
            data="cap"
            label={L("Najwięcej dziennie", "Most per day")}
            value={bank.rules.cap}
            unit="min"
            list={CAPS}
            onChange={(v) => update({ bankCap: v })}
          />
        </div>
      )}
      {notif.dailyLimit && !bank && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {L("Limit na dzień", "Limit per day")}
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label={L("Mniej", "Less")}
              onClick={() => step(-1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-border"
            >
              <Minus size={14} />
            </button>
            <span className="w-16 text-center text-sm font-semibold tabular-nums" data-limit>
              {notif.dailyLimitMin} min
            </span>
            <button
              aria-label={L("Więcej", "More")}
              onClick={() => step(1)}
              className="grid h-8 w-8 place-items-center rounded-full border border-border"
            >
              <Plus size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
