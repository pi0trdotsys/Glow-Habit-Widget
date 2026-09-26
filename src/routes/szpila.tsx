import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { motion } from "framer-motion";
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
  CONDITION_LABEL,
  type Challenge,
  type Progress,
  type Unlockable,
} from "@/lib/habits/gamification";

export const Route = createFileRoute("/szpila")({
  head: () => ({ meta: [{ title: "Szpila - kot, serie i wyzwania" }] }),
  component: SzpilaPage,
});

const days = (n: number) => (n === 1 ? "dzień" : "dni");

const WREDNY_SAMPLE = "„{name}” czeka, a ty udajesz, że nie widzisz. Rusz dupę.";

function SzpilaPage() {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const nightHits = useHabits((s) => s.nightHits);
  const liveOn = useHabits((s) => s.notifications.live);
  const look = useHabits((s) => s.szpila);
  const setSzpila = useHabits((s) => s.setSzpila);

  const p = useMemo(() => progressOf(habits, completions, nightHits, liveOn), [habits, completions, nightHits, liveOn]);
  const challenges = useMemo(
    () => weeklyChallenges(habits, completions, nightHits, liveOn),
    [habits, completions, nightHits, liveOn],
  );
  const next = nextUnlock(p);
  const condition = useCatCondition();
  const sampleHabit = habits.find((h) => h.kind !== "avoid")?.name ?? "Czytanie";

  const choose = <T extends string>(u: Unlockable<T>, kind: "face" | "humor") => {
    if (!isUnlocked(u, p)) {
      toast(u.weeks ? `🔒 Zalicz komplet wyzwań w jednym tygodniu.` : `🔒 Potrzebujesz ${u.streak} ${days(u.streak ?? 0)} formy z rzędu.`);
      return;
    }
    setSzpila(kind === "face" ? { face: u.id as never } : { humor: u.id as never });
  };

  return (
    <AppShell>
      <header className="flex items-center gap-4 px-5 pt-10 pb-5">
        <motion.div
          key={look.face}
          initial={{ rotate: -12, scale: 0.8 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 13 }}
        >
          <SzpilaAvatar mood={conditionMood(condition, "smug")} face={look.face} condition={condition} size={88} />
        </motion.div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em]" style={{ color: "var(--avoid)" }}>
            mina {FACES.find((f) => f.id === look.face)?.name} · humor {HUMORS.find((h) => h.id === look.humor)?.name}
          </p>
          <h1 className="mt-1 font-display text-4xl font-bold tracking-tight">Szpila</h1>
          <p className="mt-1 text-xs text-muted-foreground" data-condition={condition}>
            Kot jest {CONDITION_LABEL[condition]}.{" "}
            {condition === "neglected"
              ? "Tydzień wpadek - ogarnij się, to się ogarnie."
              : condition === "groomed"
              ? "Seria w formie robi swoje."
              : "3 dni w formie z rzędu i będzie zadbany."}
          </p>
        </div>
      </header>

      <StreakCard p={p} next={next} />

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Trophy size={14} /> Wyzwania tygodnia
        </h2>
        <ul className="space-y-3">
          {challenges.map((c) => (
            <ChallengeRow key={c.id} c={c} />
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Nowe wyzwania w każdy poniedziałek. Komplet w jednym tygodniu odblokowuje minę DJ.
          {p.perfectWeeks > 0 ? ` Kompletnych tygodni: ${p.perfectWeeks}.` : ""}
        </p>
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Miny</h2>
        <div className="grid grid-cols-3 gap-3">
          {FACES.map((f) => {
            const open = isUnlocked(f, p);
            const active = look.face === f.id;
            return (
              <button
                key={f.id}
                onClick={() => choose(f, "face")}
                aria-label={`Mina ${f.name}${open ? "" : " (zablokowana)"}`}
                className="relative flex flex-col items-center gap-1 rounded-2xl p-2 transition active:scale-95"
                style={{
                  border: `1.5px solid ${active ? "var(--avoid)" : "var(--border)"}`,
                  background: active ? "color-mix(in oklab, var(--avoid) 12%, transparent)" : "transparent",
                }}
              >
                <div style={{ filter: open ? undefined : "grayscale(1) brightness(0.55)" }}>
                  <SzpilaAvatar mood="smug" face={f.id} size={56} />
                </div>
                <span className="text-xs font-medium">{f.name}</span>
                <span className="text-[10px] text-muted-foreground">
                  {open ? (active ? "wybrana" : "odblokowana") : f.weeks ? "komplet wyzwań" : `${f.streak} ${days(f.streak ?? 0)} formy`}
                </span>
                {!open && <Lock size={12} className="absolute right-2 top-2 text-muted-foreground" />}
              </button>
            );
          })}
        </div>
      </section>

      <section className="mx-5 mt-4 rounded-3xl bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Humory</h2>
        <ul className="space-y-2">
          {HUMORS.map((h) => {
            const open = isUnlocked(h, p);
            const active = look.humor === h.id;
            const sample = (h.id === "wredny" ? WREDNY_SAMPLE : humorLines(h.id).nag[0]).replaceAll("{name}", sampleHabit);
            return (
              <li key={h.id}>
                <button
                  onClick={() => choose(h, "humor")}
                  className="w-full rounded-2xl p-3 text-left transition active:scale-[0.99]"
                  style={{
                    border: `1.5px solid ${active ? "var(--avoid)" : "var(--border)"}`,
                    background: active ? "color-mix(in oklab, var(--avoid) 10%, transparent)" : "transparent",
                    opacity: open ? 1 : 0.6,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{h.name}</span>
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                      {open ? active ? "wybrany" : "odblokowany" : <><Lock size={11} /> {h.streak} {days(h.streak ?? 0)} formy</>}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{h.blurb}</div>
                  {open && <p className="mt-1.5 text-xs italic leading-snug">„{sample.replace(/^„|”$/g, "")}”</p>}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Humor miesza się z klasycznymi szpilami (tryb „Ostro”) - w aplikacji, powiadomieniach, widżecie i w nocy.
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
        background: "linear-gradient(135deg, color-mix(in oklab, var(--avoid) 18%, var(--card)), var(--card))",
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
            {days(p.current)} w formie z rzędu (≥ {Math.round(FORMA * 100)}% zadań)
          </div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold tabular-nums">{p.best}</div>
          <div className="text-[11px] text-muted-foreground">rekord</div>
        </div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-background/60">
        <motion.div
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
            ? `Jeszcze dziś w formie, a odblokujesz: ${next.kind} ${next.name}.`
            : `Jeszcze ${next.missing} ${days(next.missing)} formy do: ${next.kind} ${next.name}.`
          : "Wszystko odblokowane. Kot nie ma już nic do dodania. Prawie."}
      </p>
    </section>
  );
}

function ChallengeRow({ c }: { c: Challenge }) {
  const pct = c.goal ? Math.min(100, (c.progress / c.goal) * 100) : 0;
  const color = c.status === "done" ? "var(--primary)" : c.status === "failed" ? "var(--muted-foreground)" : "var(--avoid)";
  return (
    <li className="flex items-start gap-3" data-challenge={c.id} data-status={c.status}>
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`, color }}
      >
        {c.status === "done" ? <Check size={15} /> : c.status === "failed" ? <X size={15} /> : <Trophy size={13} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-sm font-medium" style={{ textDecoration: c.status === "failed" ? "line-through" : undefined }}>
            {c.title}
          </span>
          {c.goal > 1 && (
            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {c.progress}/{c.goal}
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {c.status === "failed" ? "Spieprzone. Za tydzień nowa szansa." : c.detail}
        </div>
        {c.goal > 1 && c.status !== "failed" && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background/60">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
          </div>
        )}
      </div>
    </li>
  );
}
