import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { m } from "framer-motion";
import { Lock, Check, X, Flame, Trophy } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SzpilaAvatar, conditionMood, useCatCondition } from "@/components/Szpila";
import { useHabits } from "@/lib/habits/store";
import {
  FACES,
  HUMORS,
  humorLines,
  isUnlocked,
  nextUnlock,
  progressOf,
  weeklyChallenges,
  FORMA,
  conditionLabel,
  kindLabel,
  unlockBlurb,
  unlockName,
  type Challenge,
  type Progress,
  type Unlockable,
} from "@/lib/habits/gamification";
import { L, pick } from "@/lib/i18n";

export const Route = createFileRoute("/szpila")({
  head: () => ({
    meta: [{ title: L("Szpila - kot, serie i wyzwania", "Szpila - cat, streaks and challenges") }],
  }),
  component: SzpilaPage,
});

// Polish keeps its original dzień/dni (the copy reads "N dni formy"); English: day/days.
const days = (n: number) => L(n === 1 ? "dzień" : "dni", n === 1 ? "day" : "days");

const wrednySample = () =>
  L(
    "„{name}” czeka, a ty udajesz, że nie widzisz. Rusz dupę.",
    "“{name}” is waiting and you're pretending not to see it. Move your butt.",
  );

const unlockNameOf = (u: Unlockable<string> | undefined) => (u ? unlockName(u) : "");

/** Display name of the next unlock (nextUnlock() gives the Polish name + kind). */
function nextName(n: NonNullable<ReturnType<typeof nextUnlock>>): string {
  const list: Unlockable<string>[] = n.kind === "mina" ? FACES : HUMORS;
  const u = list.find((x) => x.name === n.name);
  return u ? unlockName(u) : n.name;
}

function SzpilaPage() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const nightHits = useHabits((s) => s.nightHits);
  const liveOn = useHabits((s) => s.notifications.live);
  const limitOn = useHabits((s) => s.notifications.dailyLimit);
  const limitMin = useHabits((s) => s.notifications.dailyLimitMin);
  const daySocial = useHabits((s) => s.daySocial);
  // The "within the limit" challenge only once the limit is on and there's data.
  const dayLimit = useMemo(
    () =>
      limitOn && Object.keys(daySocial).length > 0
        ? { limit: limitMin, social: daySocial }
        : undefined,
    [limitOn, limitMin, daySocial],
  );
  const look = useHabits((s) => s.szpila);
  const setSzpila = useHabits((s) => s.setSzpila);

  const p = useMemo(
    () => progressOf(habits, completions, nightHits, liveOn, undefined, dayLimit),
    [habits, completions, nightHits, liveOn, dayLimit],
  );
  const challenges = useMemo(
    () => weeklyChallenges(habits, completions, nightHits, liveOn, undefined, undefined, dayLimit),
    [habits, completions, nightHits, liveOn, dayLimit],
  );
  const next = nextUnlock(p);
  const condition = useCatCondition();
  const sampleHabit = habits.find((h) => h.kind !== "avoid")?.name ?? L("Czytanie", "Reading");

  const choose = <T extends string>(u: Unlockable<T>, kind: "face" | "humor") => {
    if (!isUnlocked(u, p)) {
      toast(
        u.weeks
          ? L(
              `🔒 Zalicz komplet wyzwań w jednym tygodniu.`,
              `🔒 Complete all challenges in a single week.`,
            )
          : L(
              `🔒 Potrzebujesz ${u.streak} ${days(u.streak ?? 0)} formy z rzędu.`,
              `🔒 You need ${u.streak} ${days(u.streak ?? 0)} in form in a row.`,
            ),
      );
      return;
    }
    setSzpila(kind === "face" ? { face: u.id as never } : { humor: u.id as never });
  };

  return (
    <AppShell>
      <header className="flex items-center gap-4 px-5 pt-10 pb-5">
        <m.div
          key={look.face}
          initial={{ rotate: -12, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 13 }}
        >
          <SzpilaAvatar
            mood={conditionMood(condition, "smug")}
            face={look.face}
            condition={condition}
            size={88}
          />
        </m.div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--avoid)" }}>
            {L("mina", "face:")} {unlockNameOf(FACES.find((f) => f.id === look.face))} ·{" "}
            {L("humor", "mood:")} {unlockNameOf(HUMORS.find((h) => h.id === look.humor))}
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Szpila</h1>
          <p className="mt-1 text-xs text-muted-foreground" data-condition={condition}>
            {L("Kot jest", "The cat is")} {conditionLabel(condition)}.{" "}
            {condition === "neglected"
              ? L(
                  "Tydzień wpadek - ogarnij się, to się ogarnie.",
                  "A week of slips - get it together and so will the cat.",
                )
              : condition === "groomed"
                ? L("Seria w formie robi swoje.", "The streak is doing its thing.")
                : L(
                    "3 dni w formie z rzędu i będzie zadbany.",
                    "3 days in form in a row and it'll be groomed.",
                  )}
          </p>
        </div>
      </header>

      <StreakCard p={p} next={next} />

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Trophy size={14} /> {L("Wyzwania tygodnia", "Weekly challenges")}
        </h2>
        <ul className="space-y-3">
          {challenges.map((c) => (
            <ChallengeRow key={c.id} c={c} />
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {L(
            "Nowe wyzwania w każdy poniedziałek. Komplet w jednym tygodniu odblokowuje minę DJ.",
            "New challenges every Monday. Clear all of them in one week to unlock the DJ face.",
          )}
          {p.perfectWeeks > 0
            ? L(` Kompletnych tygodni: ${p.perfectWeeks}.`, ` Perfect weeks: ${p.perfectWeeks}.`)
            : ""}
        </p>
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Miny", "Faces")}
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {FACES.map((f) => {
            const open = isUnlocked(f, p);
            const active = look.face === f.id;
            return (
              <button
                key={f.id}
                onClick={() => choose(f, "face")}
                aria-label={L(
                  `Mina ${f.name}${open ? "" : " (zablokowana)"}`,
                  `Face ${unlockName(f)}${open ? "" : " (locked)"}`,
                )}
                className="relative flex flex-col items-center gap-1 rounded-2xl p-2 transition active:scale-95"
                style={{
                  border: `1.5px solid ${active ? "var(--avoid)" : "var(--border)"}`,
                  background: active
                    ? "color-mix(in oklab, var(--avoid) 12%, transparent)"
                    : "transparent",
                }}
              >
                <div style={{ filter: open ? undefined : "grayscale(1) brightness(0.55)" }}>
                  <SzpilaAvatar mood="smug" face={f.id} size={56} />
                </div>
                <span className="text-xs font-medium">{unlockName(f)}</span>
                <span className="text-xs text-muted-foreground">
                  {open
                    ? active
                      ? L("wybrana", "selected")
                      : L("odblokowana", "unlocked")
                    : f.weeks
                      ? L("komplet wyzwań", "all challenges")
                      : L(
                          `${f.streak} ${days(f.streak ?? 0)} formy`,
                          `${f.streak} ${days(f.streak ?? 0)} in form`,
                        )}
                </span>
                {!open && (
                  <Lock size={12} className="absolute right-2 top-2 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {L("Humory", "Moods")}
        </h2>
        <ul className="space-y-2">
          {HUMORS.map((h) => {
            const open = isUnlocked(h, p);
            const active = look.humor === h.id;
            const sample = (
              h.id === "wredny" ? wrednySample() : humorLines(h.id).nag[0]
            ).replaceAll("{name}", sampleHabit);
            return (
              <li key={h.id}>
                <button
                  onClick={() => choose(h, "humor")}
                  className="w-full rounded-2xl p-3 text-left transition active:scale-[0.99]"
                  style={{
                    border: `1.5px solid ${active ? "var(--avoid)" : "var(--border)"}`,
                    background: active
                      ? "color-mix(in oklab, var(--avoid) 10%, transparent)"
                      : "transparent",
                    opacity: open ? 1 : 0.6,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{unlockName(h)}</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {open ? (
                        active ? (
                          L("wybrany", "selected")
                        ) : (
                          L("odblokowany", "unlocked")
                        )
                      ) : (
                        <>
                          <Lock size={11} /> {h.streak} {days(h.streak ?? 0)}{" "}
                          {L("formy", "in form")}
                        </>
                      )}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{unlockBlurb(h)}</div>
                  {open && (
                    <p className="mt-1.5 text-xs italic leading-snug">
                      {L("„", "“")}
                      {sample.replace(pick(/^„|”$/g, /^[„“"]|[”"]$/g), "")}”
                    </p>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          {L(
            "Humor miesza się z klasycznymi szpilami (tryb „Wulgarny”) - w aplikacji, powiadomieniach, widżecie i w nocy.",
            "The mood mixes with the classic jabs (“Foul-mouthed” mode) - in the app, notifications, the widget and at night.",
          )}
        </p>
      </section>
    </AppShell>
  );
}

function StreakCard({ p, next }: { p: Progress; next: ReturnType<typeof nextUnlock> }) {
  const target = next ? p.current + Math.max(0, next.missing) : p.best;
  const pct = next && target > 0 ? Math.min(100, (p.current / target) * 100) : 100;
  return (
    <section
      className="mx-5 rounded-3xl p-5"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--avoid) 18%, var(--card)), var(--card))",
        border: "1px solid color-mix(in oklab, var(--avoid) 28%, transparent)",
      }}
    >
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2 text-4xl font-bold tabular-nums">
            <Flame size={30} style={{ color: "var(--avoid)" }} />
            {p.current}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {L(
              `${days(p.current)} w formie z rzędu (≥ ${Math.round(FORMA * 100)}% zadań)`,
              `${days(p.current)} in form in a row (≥ ${Math.round(FORMA * 100)}% of habits)`,
            )}
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">{p.best}</div>
          <div className="text-xs text-muted-foreground">{L("rekord", "best")}</div>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/60">
        <m.div
          className="h-full rounded-full"
          style={{ backgroundColor: "var(--avoid)" }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {next
          ? next.missing <= 0
            ? L(
                `Jeszcze dziś w formie, a odblokujesz: ${kindLabel(next.kind)} ${nextName(next)}.`,
                `Stay in form today and you unlock: ${kindLabel(next.kind)} ${nextName(next)}.`,
              )
            : L(
                `Jeszcze ${next.missing} ${days(next.missing)} formy do: ${kindLabel(next.kind)} ${nextName(next)}.`,
                `${next.missing} more ${days(next.missing)} in form to: ${kindLabel(next.kind)} ${nextName(next)}.`,
              )
          : L(
              "Wszystko odblokowane. Kot nie ma już nic do dodania. Prawie.",
              "Everything unlocked. The cat has nothing left to add. Almost.",
            )}
      </p>
    </section>
  );
}

function ChallengeRow({ c }: { c: Challenge }) {
  const pct = c.goal ? Math.min(100, (c.progress / c.goal) * 100) : 0;
  const color =
    c.status === "done"
      ? "var(--primary)"
      : c.status === "failed"
        ? "var(--muted-foreground)"
        : "var(--avoid)";
  return (
    <li className="flex items-start gap-3" data-challenge={c.id} data-status={c.status}>
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
      >
        {c.status === "done" ? (
          <Check size={15} />
        ) : c.status === "failed" ? (
          <X size={15} />
        ) : (
          <Trophy size={13} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="text-sm font-medium"
            style={{ textDecoration: c.status === "failed" ? "line-through" : undefined }}
          >
            {c.title}
          </span>
          {c.goal > 1 && (
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {c.progress}/{c.goal}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {c.status === "failed"
            ? L("Spieprzone. Za tydzień nowa szansa.", "Blown it. New shot next week.")
            : c.detail}
        </div>
        {c.goal > 1 && c.status !== "failed" && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
            <div
              className="h-full rounded-full"
              style={{ width: `${pct}%`, backgroundColor: color }}
            />
          </div>
        )}
      </div>
    </li>
  );
}
