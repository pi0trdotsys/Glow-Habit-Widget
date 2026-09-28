import { Monitor, Moon, Sun } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import type { ThemePref } from "@/lib/theme";
import { L } from "@/lib/i18n";

const OPTIONS: { id: ThemePref; icon: typeof Sun; label: () => string }[] = [
  { id: "system", icon: Monitor, label: () => L("Jak telefon", "Like phone") },
  { id: "dark", icon: Moon, label: () => L("Ciemny", "Dark") },
  { id: "light", icon: Sun, label: () => L("Jasny", "Light") },
];

/** Settings: light / dark theme. */
export function ThemeCard() {
  const theme = useHabits((s) => s.theme);
  const setTheme = useHabits((s) => s.setTheme);
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="font-medium">{L("Wygląd", "Appearance")}</div>
      <div
        className="mt-3 grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={L("Motyw", "Theme")}
      >
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const on = theme === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              data-theme-option={o.id}
              onClick={() => setTheme(o.id)}
              className="flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-sm font-semibold transition"
              style={{
                borderColor: on ? "var(--avoid)" : "var(--border)",
                backgroundColor: on
                  ? "color-mix(in oklab, var(--avoid) 14%, transparent)"
                  : "transparent",
              }}
            >
              <Icon size={18} />
              {o.label()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
