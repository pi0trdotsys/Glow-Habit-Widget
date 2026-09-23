import { useState } from "react";
import { useHabits } from "@/lib/habits/store";

export function NameOnboarding() {
  const userName = useHabits((s) => s.userName);
  const setUserName = useHabits((s) => s.setUserName);
  const [name, setName] = useState("");

  if (userName) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/95 backdrop-blur-xl px-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="font-display text-2xl font-bold tracking-tight">Witaj w Loop</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Jak mam się do ciebie zwracać?
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
            placeholder="Twoje imię"
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
            Zaczynamy
          </button>
        </form>
      </div>
    </div>
  );
}