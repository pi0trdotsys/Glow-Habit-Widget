import { useState } from "react";
import { useHabits } from "@/lib/habits/store";
import { L, LANGUAGES } from "@/lib/i18n";

export function NameOnboarding() {
  const userName = useHabits((s) => s.userName);
  const setUserName = useHabits((s) => s.setUserName);
  const language = useHabits((s) => s.language);
  const setLanguage = useHabits((s) => s.setLanguage);
  const [name, setName] = useState("");

  if (userName) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 backdrop-blur-xl px-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl">
        {/* Language first - everything below (and the default habits) follows it. */}
        <div
          className="mb-5 grid grid-cols-2 gap-2"
          role="radiogroup"
          aria-label="Język / Language"
        >
          {LANGUAGES.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={language === l.id}
              data-lang={l.id}
              onClick={() => setLanguage(l.id)}
              className="rounded-2xl border py-2.5 text-sm font-semibold transition"
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
        <h2 className="font-display text-2xl font-bold tracking-tight">
          {L("Witaj w Szpili", "Welcome to Szpila")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {L("Jak mam się do ciebie zwracać?", "What should I call you?")}
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setUserName(name.trim());
          }}
          className="mt-5 space-y-3"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={L("Twoje imię", "Your name")}
            maxLength={24}
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="w-full rounded-2xl py-3 font-medium disabled:opacity-40"
            style={{
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
            }}
          >
            {L("Zaczynamy", "Let's go")}
          </button>
        </form>
      </div>
    </div>
  );
}
