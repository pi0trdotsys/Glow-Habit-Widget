import { useRef, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import { THEMES, THEME_META, type Theme, type ThemePref } from "@/lib/theme";
import { L } from "@/lib/i18n";

const OPTIONS: ThemePref[] = ["system", ...THEMES];

function themeLabel(id: ThemePref): string {
  if (id === "system") return L("Jak telefon", "Like phone");
  const [pl, en] = THEME_META[id].name;
  return L(pl, en);
}

/** A mini screen in the theme's own colours (data-theme scopes the palette to this box). */
function Swatch({ theme, compact = false }: { theme: Theme; compact?: boolean }) {
  return (
    <div
      data-theme={theme}
      className="relative h-full overflow-hidden"
      style={{ backgroundColor: "var(--background)", color: "var(--foreground)" }}
    >
      <div className="absolute inset-x-1.5 inset-y-2 flex items-center justify-between gap-1 rounded-md bg-card px-1.5">
        <span className="theme-display text-[13px] font-bold leading-none">Aa</span>
        <span className={compact ? "hidden" : "flex shrink-0 gap-0.5"}>
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--primary)" }} />
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--avoid)" }} />
        </span>
      </div>
    </div>
  );
}

/** Settings: the app's palette (or like the phone). Home-screen widgets follow it by default. */
export function ThemeCard() {
  const theme = useHabits((s) => s.theme);
  const setTheme = useHabits((s) => s.setTheme);
  const group = useRef<HTMLDivElement>(null);

  // Radio group keys: arrows move (and pick) like native radio buttons.
  const onKey = (e: KeyboardEvent, i: number) => {
    const step =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    e.preventDefault();
    const next = OPTIONS[(i + step + OPTIONS.length) % OPTIONS.length];
    setTheme(next);
    group.current?.querySelector<HTMLElement>(`[data-theme-option="${next}"]`)?.focus();
  };

  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="font-medium">{L("Wygląd", "Appearance")}</div>
      <div
        ref={group}
        className="mt-3 grid grid-cols-3 gap-2"
        role="radiogroup"
        aria-label={L("Motyw", "Theme")}
      >
        {OPTIONS.map((id, i) => {
          const on = theme === id;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (!OPTIONS.includes(theme) && i === 0) ? 0 : -1}
              data-theme-option={id}
              onClick={() => setTheme(id)}
              onKeyDown={(e) => onKey(e, i)}
              className="flex flex-col gap-1.5 rounded-xl border p-1.5 pb-2 text-left text-[13px] font-semibold leading-tight transition active:scale-95"
              style={{
                borderColor: on ? "var(--avoid)" : "var(--border)",
                backgroundColor: on
                  ? "color-mix(in oklab, var(--avoid) 14%, transparent)"
                  : "transparent",
              }}
            >
              <span
                className="relative block h-12 overflow-hidden rounded-lg border"
                style={{ borderColor: "var(--border)" }}
                aria-hidden
              >
                {id === "system" ? (
                  <span className="grid h-full grid-cols-2">
                    <Swatch theme="dark" compact />
                    <Swatch theme="light" compact />
                  </span>
                ) : (
                  <Swatch theme={id} />
                )}
                {on && (
                  <span
                    className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full"
                    style={{ backgroundColor: "var(--avoid)", color: "white" }}
                  >
                    <Check size={11} strokeWidth={3.2} />
                  </span>
                )}
              </span>
              <span className="px-0.5">{themeLabel(id)}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        {L(
          "Widżety na ekranie głównym domyślnie biorą ten motyw - każdemu możesz dać własny w jego ustawieniach.",
          "Home-screen widgets follow this theme by default - each can get its own in its settings.",
        )}
      </p>
    </div>
  );
}
