import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { DEFAULT_LATE_AFTER, DEFAULT_LATE_LIMIT, openUsageSettings, requestSteps, screenGranted } from "@/lib/sensors";
import { Ban, Sparkles } from "lucide-react";
import { HabitIcon } from "./HabitIcon";
import { AVOID_COLOR, HABIT_COLOR_VAR, HABIT_COLORS, HABIT_ICONS } from "@/lib/habits/colors";
import type {
  GoalType,
  HabitSource,
  Habit,
  HabitColor,
  HabitKind,
  HabitScheduleType,
  LimitPeriod,
  TimeOfDay,
} from "@/lib/habits/types";

export type HabitDraft = Omit<Habit, "id" | "createdAt">;

// Mon-first display; values are JS getDay() (0 = Sunday).
const DAYS = [
  { label: "Pn", v: 1 },
  { label: "Wt", v: 2 },
  { label: "Śr", v: 3 },
  { label: "Cz", v: 4 },
  { label: "Pt", v: 5 },
  { label: "Sb", v: 6 },
  { label: "Nd", v: 0 },
];

const COLOR_NAMES: Record<HabitColor, string> = {
  mint: "miętowy",
  coral: "koralowy",
  amber: "bursztynowy",
  violet: "fioletowy",
  sky: "błękitny",
  rose: "różowy",
  lime: "limonkowy",
  sand: "piaskowy",
};

/** One-tap starting points, tuned so the planner and Szpila recognise them. */
const TEMPLATES: HabitDraft[] = [
  { name: "Mycie zębów", icon: "Tooth", color: "mint", schedule: { type: "daily" }, goal: { type: "count", target: 2, step: 1, unit: "razy" } },
  { name: "Picie wody", icon: "GlassWater", color: "sky", schedule: { type: "daily" }, goal: { type: "count", target: 8, step: 1, unit: "szklanek" } },
  { name: "8000 kroków", icon: "Footprints", color: "lime", schedule: { type: "daily" }, goal: { type: "count", target: 8000, step: 1000, unit: "kroków" } },
  { name: "Czytanie książki", icon: "BookOpen", color: "amber", schedule: { type: "daily" }, goal: { type: "minutes", target: 20, step: 10 }, timeOfDay: "evening" },
  { name: "Medytacja", icon: "Sparkles", color: "violet", schedule: { type: "daily" }, goal: { type: "minutes", target: 10, step: 5 }, timeOfDay: "morning" },
  { name: "Siłownia", icon: "Dumbbell", color: "coral", schedule: { type: "timesPerWeek", target: 3 } },
  { name: "Witaminy", icon: "Pill", color: "sand", schedule: { type: "daily" }, timeOfDay: "morning" },
  { name: "Telefon do późna", icon: "Phone", color: "rose", schedule: { type: "daily" }, kind: "avoid", limit: { times: 1, period: "week" } },
  { name: "Fast food", icon: "Utensils", color: "coral", schedule: { type: "daily" }, kind: "avoid", limit: { times: 1, period: "week" } },
  { name: "Słodycze", icon: "Cookie", color: "rose", schedule: { type: "daily" }, kind: "avoid", limit: { times: 2, period: "week" } },
  { name: "Alkohol", icon: "CupSoda", color: "amber", schedule: { type: "daily" }, kind: "avoid", limit: { times: 1, period: "week" } },
  { name: "Scrollowanie rolek", icon: "Film", color: "violet", schedule: { type: "daily" }, kind: "avoid", limit: { times: 0, period: "week" } },
];

interface Props {
  initial?: Habit;
  onSave: (draft: HabitDraft) => void;
  onCancel: () => void;
  saveLabel?: string;
  disabledReason?: string | null;
}

export function HabitForm({ initial, onSave, onCancel, saveLabel = "Zapisz", disabledReason }: Props) {
  const [kind, setKind] = useState<HabitKind>(initial?.kind ?? "build");
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState<string>(initial?.icon ?? "Sparkles");
  const [color, setColor] = useState<HabitColor>(initial?.color ?? "mint");
  const [type, setType] = useState<HabitScheduleType>(initial?.schedule.type ?? "daily");
  const [days, setDays] = useState<number[]>(initial?.schedule.days ?? [1, 2, 3, 4, 5]);
  const [weekTarget, setWeekTarget] = useState(initial?.schedule.target ?? 3);
  const [goalType, setGoalType] = useState<GoalType>(initial?.goal?.type ?? "check");
  const [goalTarget, setGoalTarget] = useState(initial?.goal?.target ?? 8);
  const [goalStep, setGoalStep] = useState(initial?.goal?.step ?? 1);
  const [goalUnit, setGoalUnit] = useState(initial?.goal?.unit ?? "");
  const [limitTimes, setLimitTimes] = useState(initial?.limit?.times ?? 0);
  const [limitPeriod, setLimitPeriod] = useState<LimitPeriod>(initial?.limit?.period ?? "week");
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>(initial?.timeOfDay ?? "anytime");
  const [reminderOn, setReminderOn] = useState(!!initial?.reminder);
  const [reminderTime, setReminderTime] = useState(initial?.reminder ?? "08:00");
  const [source, setSource] = useState<HabitSource | undefined>(initial?.source);
  const [lateAfter, setLateAfter] = useState(initial?.lateAfter ?? DEFAULT_LATE_AFTER);
  const [lateLimit, setLateLimit] = useState(initial?.lateLimit ?? DEFAULT_LATE_LIMIT);
  const isNative = Capacitor.isNativePlatform();

  const avoid = kind === "avoid";
  const accent = avoid ? AVOID_COLOR : HABIT_COLOR_VAR[color];
  const canSave = name.trim().length > 0 && !disabledReason;

  const applyTemplate = (t: HabitDraft) => {
    setKind(t.kind ?? "build");
    setName(t.name);
    setIcon(t.icon);
    setColor(t.color);
    setType(t.schedule.type);
    if (t.schedule.target) setWeekTarget(t.schedule.target);
    setGoalType(t.goal?.type ?? "check");
    if (t.goal) {
      setGoalTarget(t.goal.target);
      setGoalStep(t.goal.step ?? 1);
      setGoalUnit(t.goal.unit ?? "");
    }
    setLimitTimes(t.limit?.times ?? 0);
    setLimitPeriod(t.limit?.period ?? "week");
    setTimeOfDay(t.timeOfDay ?? "anytime");
  };

  const save = () => {
    if (!canSave) return;
    onSave({
      name: name.trim(),
      icon,
      color,
      kind,
      schedule:
        type === "daily"
          ? { type: "daily" }
          : type === "weekdays"
          ? { type: "weekdays", days }
          : { type: "timesPerWeek", target: weekTarget },
      goal:
        avoid || goalType === "check"
          ? undefined
          : {
              type: goalType,
              target: Math.max(1, goalTarget),
              step: Math.max(1, Math.min(goalStep, goalTarget)),
              unit: goalType === "count" ? goalUnit.trim() || undefined : undefined,
            },
      limit: avoid ? { times: limitTimes, period: limitPeriod } : undefined,
      timeOfDay,
      // A source only makes sense for its kind: steps -> build count, screen -> avoid.
      source: (source === "steps" && !avoid && goalType === "count") || (source === "screen" && avoid) ? source : undefined,
      lateAfter: source === "screen" && avoid ? lateAfter : undefined,
      lateLimit: source === "screen" && avoid ? lateLimit : undefined,
      reminder: reminderOn ? reminderTime : null,
    });
  };

  return (
    <>
      <header className="flex items-center justify-between px-5 pt-8 pb-4">
        <button onClick={onCancel} className="rounded-full bg-card px-4 py-2 text-sm font-medium">
          Anuluj
        </button>
        <button
          onClick={save}
          disabled={!canSave}
          className="rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-40"
          style={{ backgroundColor: avoid ? AVOID_COLOR : "var(--primary)", color: "var(--primary-foreground)" }}
        >
          {saveLabel}
        </button>
      </header>

      <div className="px-5 pb-10">
        <div className="grid grid-cols-2 gap-2 rounded-full bg-card p-1">
          {(["build", "avoid"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className="flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition-colors"
              style={{
                backgroundColor: kind === k ? (k === "avoid" ? AVOID_COLOR : "var(--primary)") : "transparent",
                color: kind === k ? "var(--primary-foreground)" : "var(--muted-foreground)",
              }}
            >
              {k === "avoid" ? <Ban size={15} /> : <Sparkles size={15} />}
              {k === "avoid" ? "Nie chcę robić" : "Chcę robić"}
            </button>
          ))}
        </div>
        {avoid && (
          <p className="mt-2 text-center text-[11px]" style={{ color: AVOID_COLOR }}>
            Każdego dnia potwierdzasz „dziś czysto”. Brak potwierdzenia = wpadka.
          </p>
        )}

        {!initial && (
          <Section title="Szablony">
            <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
              {TEMPLATES.filter((t) => (t.kind ?? "build") === kind).map((t) => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-2 text-xs font-medium"
                >
                  <HabitIcon name={t.icon} size={14} style={{ color: t.kind === "avoid" ? AVOID_COLOR : HABIT_COLOR_VAR[t.color] }} />
                  {t.name}
                </button>
              ))}
            </div>
          </Section>
        )}

        <div className="flex flex-col items-center gap-4 py-5">
          <div
            className="grid h-24 w-24 place-items-center rounded-full"
            style={{
              backgroundColor: `color-mix(in oklab, ${accent} 22%, transparent)`,
              boxShadow: `0 0 0 2px ${accent}`,
            }}
          >
            <HabitIcon name={icon} size={42} strokeWidth={1.8} style={avoid ? { color: AVOID_COLOR } : undefined} />
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={avoid ? "Czego nie chcesz robić?" : "Nazwa zadania"}
            className="w-full rounded-2xl bg-card px-4 py-3 text-center text-lg font-medium outline-none placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring"
            maxLength={40}
          />
        </div>

        {avoid ? (
          <Section title="Limit">
            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-center gap-4">
                <Stepper value={limitTimes} min={0} max={30} onChange={setLimitTimes} label={limitTimes === 0 ? "0×" : `${limitTimes}×`} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["day", "week", "month"] as const).map((p) => (
                  <Chip key={p} on={limitPeriod === p} onClick={() => setLimitPeriod(p)} accent={AVOID_COLOR}>
                    {p === "day" ? "dziennie" : p === "week" ? "w tygodniu" : "w miesiącu"}
                  </Chip>
                ))}
              </div>
              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                {limitTimes === 0
                  ? "Całkowity zakaz - każda wpadka się liczy."
                  : `Dozwolone ${limitTimes} ${limitTimes === 1 ? "raz" : "razy"} ${
                      limitPeriod === "day" ? "dziennie" : limitPeriod === "week" ? "w tygodniu" : "w miesiącu"
                    }. Powyżej - Szpila się nie hamuje.`}
              </p>
            </div>
            {isNative && (
              <ScreenSourceBox
                on={source === "screen"}
                onToggle={(on) => setSource(on ? "screen" : undefined)}
                lateAfter={lateAfter}
                setLateAfter={setLateAfter}
                lateLimit={lateLimit}
                setLateLimit={setLateLimit}
              />
            )}
          </Section>
        ) : (
          <Section title="Cel dzienny">
            <div className="grid grid-cols-3 gap-2">
              {(["check", "count", "minutes"] as const).map((g) => (
                <Chip key={g} on={goalType === g} onClick={() => setGoalType(g)}>
                  {g === "check" ? "Raz" : g === "count" ? "Ile razy" : "Ile minut"}
                </Chip>
              ))}
            </div>
            {goalType !== "check" && (
              <div className="mt-3 space-y-3 rounded-2xl bg-card p-4">
                <Row label={goalType === "minutes" ? "Minut dziennie" : "Ile dziennie"}>
                  <NumberInput value={goalTarget} onChange={setGoalTarget} max={100000} />
                </Row>
                {goalType === "count" && (
                  <Row label="Jednostka">
                    <input
                      value={goalUnit}
                      onChange={(e) => setGoalUnit(e.target.value)}
                      placeholder="np. szklanek, kroków"
                      maxLength={16}
                      className="w-40 rounded-xl border border-border bg-background px-3 py-1.5 text-right text-sm outline-none"
                    />
                  </Row>
                )}
                <Row label="Jedno przytrzymanie dodaje">
                  <NumberInput value={goalStep} onChange={setGoalStep} max={Math.max(1, goalTarget)} />
                </Row>
                <p className="text-[11px] text-muted-foreground">
                  Przytrzymaj kafelek, by dodać {goalStep} {goalType === "minutes" ? "min" : goalUnit || "raz(y)"}. Dokładną
                  ilość wpiszesz na stronie zadania.
                </p>
                {isNative && goalType === "count" && (
                  <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <div>
                      <div className="text-sm font-medium">Kroki z Health Connect</div>
                      <div className="text-[11px] text-muted-foreground">
                        Ilość uzupełnia się sama z Google Fit / Samsung Health / Mi Fitness.
                      </div>
                    </div>
                    <Toggle
                      checked={source === "steps"}
                      onChange={async (on) => {
                        if (!on) return setSource(undefined);
                        const s = await requestSteps();
                        if (!s.available) return alert("Health Connect jest niedostępny na tym telefonie.");
                        if (!s.granted) return alert("Bez zgody na odczyt kroków nie da się ich pobierać.");
                        setSource("steps");
                        if (!goalUnit) setGoalUnit("kroków");
                        if (goalStep === 1 && goalTarget >= 1000) setGoalStep(1000);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {!avoid && (
          <Section title="Kolor">
            <div className="flex flex-wrap gap-3">
              {HABIT_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-10 w-10 rounded-full transition"
                  style={{
                    backgroundColor: HABIT_COLOR_VAR[c],
                    outline: color === c ? "3px solid var(--foreground)" : "none",
                    outlineOffset: 2,
                  }}
                  aria-label={COLOR_NAMES[c]}
                />
              ))}
            </div>
          </Section>
        )}

        <Section title="Ikona">
          <div className="grid grid-cols-6 gap-2">
            {HABIT_ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className="grid aspect-square place-items-center rounded-xl bg-card transition"
                style={{ outline: icon === i ? `2px solid ${avoid ? AVOID_COLOR : "var(--primary)"}` : "none" }}
              >
                <HabitIcon name={i} size={20} strokeWidth={1.8} />
              </button>
            ))}
          </div>
        </Section>

        <Section title="Harmonogram">
          <div className="grid grid-cols-3 gap-2">
            {(["daily", "weekdays", "timesPerWeek"] as const).map((t) => (
              <Chip key={t} on={type === t} onClick={() => setType(t)} accent={avoid ? AVOID_COLOR : undefined}>
                {t === "daily" ? "Codziennie" : t === "weekdays" ? "Wybrane dni" : "X / tydzień"}
              </Chip>
            ))}
          </div>

          {type === "weekdays" && (
            <div className="mt-3 flex justify-between">
              {DAYS.map(({ label, v }) => {
                const on = days.includes(v);
                return (
                  <button
                    key={v}
                    onClick={() => setDays((d) => (on ? d.filter((x) => x !== v) : [...d, v].sort()))}
                    className="h-10 w-10 rounded-full text-xs font-semibold"
                    style={{
                      backgroundColor: on ? "var(--primary)" : "var(--card)",
                      color: on ? "var(--primary-foreground)" : "var(--muted-foreground)",
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {type === "timesPerWeek" && (
            <div className="mt-3 flex items-center justify-center rounded-2xl bg-card py-4">
              <Stepper value={weekTarget} min={1} max={7} onChange={setWeekTarget} label={`${weekTarget}×`} />
            </div>
          )}
        </Section>

        <Section title="Pora dnia">
          <div className="grid grid-cols-4 gap-2">
            {(["morning", "midday", "evening", "anytime"] as const).map((t) => (
              <Chip key={t} on={timeOfDay === t} onClick={() => setTimeOfDay(t)} accent={avoid ? AVOID_COLOR : undefined}>
                {t === "morning" ? "Rano" : t === "midday" ? "W dzień" : t === "evening" ? "Wieczór" : "Obojętnie"}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Na tej podstawie widżet „Następne zadanie” i plan dnia podpowiadają, co robić teraz. „Obojętnie” = aplikacja
            uczy się, kiedy zwykle to robisz.
          </p>
        </Section>

        <Section title="Przypomnienie">
          <div className="rounded-2xl bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Przypominaj codziennie</span>
              <Toggle checked={reminderOn} onChange={setReminderOn} />
            </div>
            {reminderOn && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Godzina</span>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none"
                />
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">
              Powiadomienie o tej godzinie każdego dnia. Włącz powiadomienia w Ustawieniach.
            </p>
          </div>
        </Section>

        {disabledReason && <p className="mt-4 text-center text-xs text-destructive">{disabledReason}</p>}
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Chip({
  on,
  onClick,
  accent,
  children,
}: {
  on: boolean;
  onClick: () => void;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-2 py-2 text-xs font-medium"
      style={{
        backgroundColor: on ? accent ?? "var(--primary)" : "var(--card)",
        color: on ? "var(--primary-foreground)" : "var(--foreground)",
      }}
    >
      {children}
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function NumberInput({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      max={max}
      value={Number.isFinite(value) ? value : ""}
      onChange={(e) => onChange(Math.max(0, Math.min(max, Math.round(Number(e.target.value) || 0))))}
      onBlur={() => value < 1 && onChange(1)}
      className="w-28 rounded-xl border border-border bg-background px-3 py-1.5 text-right text-sm tabular-nums outline-none"
    />
  );
}

function Stepper({
  value,
  min,
  max,
  onChange,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <button onClick={() => onChange(Math.max(min, value - 1))} className="h-9 w-9 rounded-full bg-secondary text-lg">
        −
      </button>
      <span className="w-16 text-center text-2xl font-bold">{label}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} className="h-9 w-9 rounded-full bg-secondary text-lg">
        +
      </button>
    </div>
  );
}

export function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <label className="relative inline-flex h-6 w-11 cursor-pointer items-center">
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="absolute inset-0 rounded-full bg-muted peer-checked:bg-primary transition-colors" />
      <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background transition-transform peer-checked:translate-x-5" />
    </label>
  );
}

/** Avoid habits: judge the day automatically from late-night screen time. */
function ScreenSourceBox({
  on,
  onToggle,
  lateAfter,
  setLateAfter,
  lateLimit,
  setLateLimit,
}: {
  on: boolean;
  onToggle: (on: boolean) => void;
  lateAfter: string;
  setLateAfter: (v: string) => void;
  lateLimit: number;
  setLateLimit: (n: number) => void;
}) {
  const [granted, setGranted] = useState<boolean | null>(null);
  useEffect(() => {
    const check = () => void screenGranted().then(setGranted);
    check();
    // Usage access is granted in system settings - re-check when we come back.
    const onVis = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  return (
    <div className="mt-3 rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">Oceniaj z czasu ekranu</div>
          <div className="text-[11px] text-muted-foreground">
            Bez klikania: telefon używany w nocy dłużej niż limit = wpadka, inaczej rano dzień jest czysty.
          </div>
        </div>
        <Toggle checked={on} onChange={onToggle} />
      </div>
      {on && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <Row label="Późno, czyli po">
            <input
              type="time"
              value={lateAfter}
              onChange={(e) => e.target.value && setLateAfter(e.target.value)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none"
            />
          </Row>
          <Row label="Tolerancja (minut)">
            <NumberInput value={lateLimit} onChange={setLateLimit} max={240} />
          </Row>
          {granted === false && (
            <button
              onClick={() => void openUsageSettings()}
              className="w-full rounded-xl py-2 text-sm font-semibold"
              style={{ backgroundColor: AVOID_COLOR, color: "var(--primary-foreground)" }}
            >
              Przyznaj „dostęp do danych o użyciu”
            </button>
          )}
          {granted && <p className="text-[11px] text-muted-foreground">Dostęp przyznany ✓</p>}
        </div>
      )}
    </div>
  );
}
