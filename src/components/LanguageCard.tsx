import { Languages } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import { L, LANGUAGES } from "@/lib/i18n";

/** Settings: app language (Polski / English). Default habit names follow the choice. */
export function LanguageCard() {
  const language = useHabits((s) => s.language);
  const setLanguage = useHabits((s) => s.setLanguage);
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center gap-3">
        <Languages size={18} className="text-primary" />
        <span className="font-medium">{L("Język", "Language")}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Język / Language">
        {LANGUAGES.map((l) => (
          <button
            key={l.id}
            type="button"
            role="radio"
            aria-checked={language === l.id}
            data-lang={l.id}
            onClick={() => setLanguage(l.id)}
            className="rounded-xl border py-2 text-sm font-semibold transition"
            style={{
              borderColor: language === l.id ? "var(--avoid)" : "var(--border)",
              backgroundColor:
                language === l.id
                  ? "color-mix(in oklab, var(--avoid) 14%, transparent)"
                  : "transparent",
            }}
          >
            {l.flag} {l.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {L(
          "Zmienia całą aplikację, szpile, powiadomienia i widżety. Domyślne nazwy zadań też się przetłumaczą, własne zostają.",
          "Switches the whole app, Szpila's jabs, notifications and widgets. Default habit names get translated too; your own stay as they are.",
        )}
      </p>
    </div>
  );
}
