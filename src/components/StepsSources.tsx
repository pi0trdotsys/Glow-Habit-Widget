import { useEffect, useState } from "react";
import { RefreshCw, Watch } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import { L, plural } from "@/lib/i18n";
import { fmtNum } from "@/lib/habits/utils";
import { openApp, stepsSources, syncStepsNow } from "@/lib/sensors";
import { sourceName, unlinkedStepHabits, type StepsSource } from "@/lib/steps";

const stepsWord = (n: number) => plural(n, ["krok", "kroki", "kroków"], ["step", "steps"]);

/**
 * Settings → Auto-tracking, once steps are connected: which app the steps come
 * from (the band via Mi Fitness, the phone, a ring...), a "sync the band" button
 * and a one-tap link for step habits still typed in by hand.
 */
export function StepsSources({ onMessage }: { onMessage: (m: string) => void }) {
  const habits = useHabits((s) => s.habits);
  const source = useHabits((s) => s.stepsSource);
  const setStepsSource = useHabits((s) => s.setStepsSource);
  const linkSteps = useHabits((s) => s.linkSteps);
  const [list, setList] = useState<StepsSource[] | null>(null);
  const [wearable, setWearable] = useState<{ pkg: string; label: string } | null>(null);

  const refresh = () =>
    void stepsSources().then((r) => {
      setList(r.sources);
      setWearable(r.wearable);
    });
  useEffect(() => {
    refresh();
    // Back from Mi Fitness: the band has (probably) synced - read again.
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      void syncStepsNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const unlinked = unlinkedStepHabits(habits);
  const pickSource = (pkg: string) => {
    setStepsSource(pkg);
    // The snapshot follows in 200 ms; read with the new source right away.
    setTimeout(() => void syncStepsNow(), 250);
  };
  const best = list?.length ? Math.max(...list.map((s) => s.steps)) : 0;

  return (
    <div className="mt-3 space-y-3 rounded-xl border border-border p-3" data-steps-sources>
      {unlinked.map((h) => (
        <div key={h.id} className="flex items-center gap-3" data-steps-link={h.id}>
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-semibold">„{h.name}”</span>{" "}
            {L(
              "wpisujesz ręcznie. Niech kroki z opaski wpisują się same.",
              "is typed in by hand. Let the band fill it in.",
            )}
          </div>
          <button
            onClick={() => {
              linkSteps(h.id);
              setTimeout(() => void syncStepsNow(), 250);
              onMessage(
                L(
                  `„${h.name}” liczy teraz kroki z opaski.`,
                  `“${h.name}” now counts your band's steps.`,
                ),
              );
            }}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {L("Podłącz", "Link")}
          </button>
        </div>
      ))}

      <div>
        <div className="text-xs font-semibold text-muted-foreground">
          {L("Skąd brać kroki", "Where steps come from")}
        </div>
        <div
          className="mt-2 space-y-1.5"
          role="radiogroup"
          aria-label={L("Źródło kroków", "Steps source")}
        >
          <SourceRow
            id="auto"
            on={source === "auto"}
            onPick={pickSource}
            title={L("Automatycznie", "Automatic")}
            sub={
              list?.length
                ? L(
                    `źródło, które naliczyło najwięcej · ${fmtNum(best)} ${stepsWord(best)}`,
                    `whichever counted the most · ${fmtNum(best)} ${stepsWord(best)}`,
                  )
                : L("najwięcej z dostępnych źródeł", "the most of all sources")
            }
          />
          {(list ?? []).map((s) => (
            <SourceRow
              key={s.pkg}
              id={s.pkg}
              on={source === s.pkg}
              onPick={pickSource}
              title={sourceName(s)}
              sub={`${fmtNum(s.steps)} ${stepsWord(s.steps)} ${L("dziś", "today")}`}
            />
          ))}
          {/* The chosen app wrote nothing today (yet) - keep it visible and pickable. */}
          {source !== "auto" && list && !list.some((s) => s.pkg === source) && (
            <SourceRow
              id={source}
              on
              onPick={pickSource}
              title={sourceName({ pkg: source, label: source })}
              sub={L("dziś jeszcze nic", "nothing yet today")}
            />
          )}
        </div>
        {list && list.length === 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {L(
              "Dziś jeszcze żadna aplikacja nie zapisała kroków. W Mi Fitness włącz Health Connect (Profil → Health Connect) i zsynchronizuj opaskę.",
              "No app has written steps today yet. In Mi Fitness turn on Health Connect (Profile → Health Connect) and sync the band.",
            )}
          </p>
        )}
      </div>

      {wearable && (
        <button
          onClick={async () => {
            const ok = await openApp(wearable.pkg);
            if (!ok) onMessage(L("Nie udało się otworzyć aplikacji.", "Couldn't open the app."));
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2 text-xs font-semibold"
          data-steps-sync
        >
          <RefreshCw size={14} />
          {L(
            `Zsynchronizuj opaskę (${sourceName(wearable)})`,
            `Sync the band (${sourceName(wearable)})`,
          )}
        </button>
      )}
    </div>
  );
}

function SourceRow({
  id,
  on,
  onPick,
  title,
  sub,
}: {
  id: string;
  on: boolean;
  onPick: (id: string) => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      data-steps-source={id}
      onClick={() => onPick(id)}
      className="flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left"
      style={{
        borderColor: on ? "var(--primary)" : "var(--border)",
        backgroundColor: on
          ? "color-mix(in oklab, var(--primary) 12%, transparent)"
          : "transparent",
      }}
    >
      <Watch size={15} className="shrink-0" style={{ color: on ? "var(--primary)" : undefined }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{sub}</span>
      </span>
    </button>
  );
}
