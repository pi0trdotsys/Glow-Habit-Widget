import { useEffect, useMemo } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useHabits } from "@/lib/habits/store";
import { JAB, armLine, bestStyle, jabsCounted, styleLabel, topArms } from "@/lib/habits/jabs";
import { syncJabs } from "@/lib/jab-sync";
import { L, plural } from "@/lib/i18n";

/** "Co na ciebie działa": the jab pools that got you moving within 30 min (Szpila tab). */
export function JabLearnCard() {
  const learn = useHabits((s) => s.jabLearn);
  const resetJabs = useHabits((s) => s.resetJabs);
  // Fresh outcomes from the native log whenever the card shows up.
  useEffect(() => void syncJabs(), []);
  const top = useMemo(() => topArms(learn.arms), [learn.arms]);
  const style = useMemo(() => bestStyle(learn.styles), [learn.styles]);
  const total = jabsCounted(learn.arms);

  const reset = () => {
    resetJabs();
    toast(
      L(
        "Szpila zapomniała, co działa. Uczy się od nowa.",
        "Szpila forgot what works. Learning from scratch.",
      ),
    );
  };

  return (
    <section className="mx-5 mt-4 rounded-3xl bg-card p-5" data-testid="jab-learn">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Sparkles size={14} /> {L("Co na ciebie działa", "What works on you")}
      </h2>
      {top.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {L(
            "Szpila jeszcze się uczy. Po każdej szpili sprawdza, czy ruszasz się w ciągu 30 min.",
            "Szpila is still learning. After every jab it checks whether you get moving within 30 min.",
          )}
        </p>
      ) : (
        <ul className="space-y-2">
          {top.map((a) => (
            <li key={a.key} className="flex items-start gap-3" data-arm={a.key}>
              <span
                className="mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums"
                style={{
                  backgroundColor: "color-mix(in oklab, var(--avoid) 16%, transparent)",
                  color: "var(--avoid)",
                }}
              >
                {Math.round((a.s / a.n) * 100)}%
              </span>
              <span className="text-sm leading-snug">{armLine(a)}</span>
            </li>
          ))}
        </ul>
      )}
      {style && (
        <p className="mt-3 text-xs text-muted-foreground">
          {L("Najlepiej działają szpile", "Best-working jabs:")} {styleLabel(style.tag)} ({style.s}/
          {style.n}).
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        {L(
          `Uczy się przez ok. 2 tygodnie (${total} ${plural(total, ["szpila", "szpile", "szpil"], ["jab", "jabs"])} z wynikiem). ${JAB.explorePct}% szpil to dalej losowe nowości.`,
          `It learns over about 2 weeks (${total} ${plural(total, ["szpila", "szpile", "szpil"], ["jab", "jabs"])} with an outcome). ${JAB.explorePct}% of jabs stay random, so new lines get tried.`,
        )}
      </p>
      {total > 0 && (
        <button
          onClick={reset}
          className="mt-3 rounded-full px-3 py-1.5 text-xs font-medium transition active:scale-95"
          style={{ border: "1.5px solid var(--border)" }}
        >
          {L("Zacznij naukę od nowa", "Start learning over")}
        </button>
      )}
    </section>
  );
}
