import { useCallback, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Search, Timer } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { amountText, amountOn, todayKey } from "@/lib/habits/utils";
import { L } from "@/lib/i18n";
import { curfewApps } from "@/lib/live";
import { openUsageSettings, syncAppsNow } from "@/lib/sensors";
import {
  appLabel,
  appMinutes,
  appsList,
  breakdown,
  isAppsHabit,
  rememberLabels,
  suggestedApps,
  unlinkedAppHabits,
} from "@/lib/apps";

export interface InstalledApp {
  pkg: string;
  label: string;
  /** Foreground minutes today. */
  today: number;
}

/**
 * Launchable apps on the phone with today's minutes. `granted` false = no
 * usage access (the list still loads, minutes are 0). Re-reads on return to the app.
 */
export function useInstalledApps(active = true) {
  const [apps, setApps] = useState<InstalledApp[] | null>(null);
  const [granted, setGranted] = useState<boolean | null>(null);
  const load = useCallback(() => {
    void Promise.all([curfewApps(), appMinutes([], 0)]).then(([list, days]) => {
      rememberLabels(list);
      const today = days?.[0]?.apps ?? {};
      setGranted(days != null);
      setApps(list.map((a) => ({ pkg: a.pkg, label: a.label, today: today[a.pkg] ?? 0 })));
    });
  }, []);
  useEffect(() => {
    if (!active || !Capacitor.isNativePlatform()) return;
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [active, load]);
  return { apps, granted };
}

/**
 * Pick the apps whose minutes count: search, several at once, the suggested
 * ones (Duolingo, Busuu... for a language) first, today's minutes per app.
 */
export function AppPicker({
  habit,
  selected,
  onChange,
}: {
  habit: Pick<Habit, "name" | "icon" | "kind">;
  selected: string[];
  onChange: (apps: string[]) => void;
}) {
  const { apps, granted } = useInstalledApps();
  const [q, setQ] = useState("");
  const chosen = useMemo(() => new Set(selected), [selected]);
  const suggested = useMemo(
    () => suggestedApps(habit, apps ? apps.map((a) => a.pkg) : null),
    [habit, apps],
  );
  const rows = useMemo(() => {
    const byPkg = new Map((apps ?? []).map((a) => [a.pkg, a]));
    // Suggested and chosen apps stay listed even when they aren't on the phone.
    for (const p of [...suggested, ...selected]) {
      if (!byPkg.has(p)) byPkg.set(p, { pkg: p, label: appLabel(p), today: -1 });
    }
    const rank = (a: InstalledApp) => (suggested.includes(a.pkg) ? 0 : chosen.has(a.pkg) ? 1 : 2);
    const needle = q.trim().toLowerCase();
    return [...byPkg.values()]
      .filter((a) => !needle || a.label.toLowerCase().includes(needle) || a.pkg.includes(needle))
      .sort(
        (a, b) =>
          rank(a) - rank(b) || b.today - a.today || a.label.localeCompare(b.label, undefined),
      );
  }, [apps, suggested, selected, chosen, q]);

  const toggle = (pkg: string) =>
    onChange(chosen.has(pkg) ? selected.filter((p) => p !== pkg) : [...selected, pkg]);

  return (
    <div className="mt-2 rounded-xl border border-border p-2" data-app-picker>
      {granted === false && (
        <div
          className="mb-2 flex items-center justify-between gap-3 rounded-lg p-2.5"
          style={{ backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)" }}
        >
          <span className="text-xs">
            {L(
              "Minuty z aplikacji wymagają „dostępu do danych o użyciu”.",
              "Minutes from apps need “usage access”.",
            )}
          </span>
          <button
            type="button"
            onClick={() => void openUsageSettings()}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {L("Otwórz", "Open")}
          </button>
        </div>
      )}
      <label className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5">
        <Search size={14} className="text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={L("Szukaj aplikacji", "Search apps")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none"
        />
      </label>
      <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
        {apps == null && (
          <div className="p-2 text-xs text-muted-foreground">{L("Wczytuję…", "Loading…")}</div>
        )}
        {rows.map((a) => {
          const on = chosen.has(a.pkg);
          return (
            <button
              key={a.pkg}
              type="button"
              role="checkbox"
              aria-checked={on}
              data-app-option={a.pkg}
              onClick={() => toggle(a.pkg)}
              className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm"
              style={{
                backgroundColor: on
                  ? "color-mix(in oklab, var(--primary) 12%, transparent)"
                  : "transparent",
              }}
            >
              <span className="min-w-0">
                <span className="block truncate">
                  {a.label}
                  {suggested.includes(a.pkg) && (
                    <span className="ml-1.5 text-xs text-primary">
                      {L("polecana", "suggested")}
                    </span>
                  )}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {a.today < 0
                    ? L("nie ma jej na telefonie", "not on this phone")
                    : L(`dziś ${a.today} min`, `today ${a.today} min`)}
                </span>
              </span>
              <span className="shrink-0 text-xs font-semibold">{on ? "✓" : ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Settings → Auto-tracking: minutes from apps. One-tap link for language /
 * reading habits typed in by hand, linked habits with today's breakdown.
 */
export function AppsSources({ onMessage }: { onMessage: (m: string) => void }) {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const linkApps = useHabits((s) => s.linkApps);
  const { apps, granted } = useInstalledApps();
  const [editing, setEditing] = useState<string | null>(null);

  if (!Capacitor.isNativePlatform()) return null;
  const installed = apps ? apps.map((a) => a.pkg) : null;
  const linked = habits.filter(isAppsHabit);
  const unlinked = unlinkedAppHabits(habits).filter((h) => suggestedApps(h, installed).length > 0);
  const key = todayKey();
  const link = (h: Habit, list: string[]) => {
    linkApps(h.id, list);
    setTimeout(() => void syncAppsNow(), 250);
  };

  return (
    <div className="mt-4 flex items-start gap-3" data-apps-sources>
      <Timer size={18} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{L("Minuty z aplikacji", "Minutes from apps")}</div>
        <div className="text-xs text-muted-foreground">
          {granted == null
            ? L("Sprawdzam…", "Checking…")
            : granted
              ? L(
                  `Czas w wybranych aplikacjach (np. Duolingo) wpisuje się sam. Ręczne poprawki zostają. · zadania: ${linked.length}`,
                  `Time in the apps you pick (e.g. Duolingo) fills in by itself. Your own corrections stay. · habits: ${linked.length}`,
                )
              : L(
                  "Wymaga „dostępu do danych o użyciu” w ustawieniach systemu.",
                  "Needs “usage access” in system settings.",
                )}
        </div>
        {granted === false && (
          <button
            onClick={() => void openUsageSettings()}
            className="mt-2 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {L("Otwórz ustawienia", "Open settings")}
          </button>
        )}
        {unlinked.map((h) => {
          const list = suggestedApps(h, installed);
          return (
            <div key={h.id} className="mt-2 flex items-center gap-3" data-apps-link={h.id}>
              <div className="min-w-0 flex-1 text-xs">
                <span className="font-semibold">„{h.name}”</span>{" "}
                {L(`- licz z ${appsList(list)}?`, `- count it from ${appsList(list)}?`)}
              </div>
              <button
                onClick={() => {
                  link(h, list);
                  onMessage(
                    L(
                      `„${h.name}” liczy teraz minuty z ${appsList(list)}. Ręcznie możesz dalej dodawać.`,
                      `“${h.name}” now counts minutes from ${appsList(list)}. You can still add by hand.`,
                    ),
                  );
                }}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {L("Licz", "Count")}
              </button>
            </div>
          );
        })}
        {linked.map((h) => {
          const c = completions.find((x) => x.habitId === h.id && x.date === key);
          const line = breakdown(c) || L("dziś jeszcze nic", "nothing yet today");
          return (
            <div key={h.id} className="mt-2" data-apps-linked={h.id}>
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1 text-xs">
                  ⏱️ <span className="font-semibold">„{h.name}”</span> {L("z", "from")}{" "}
                  {appsList(h.apps ?? [])} · {amountText(h, amountOn(h, completions, new Date()))}
                  <span className="block text-muted-foreground">{line}</span>
                </div>
                <button
                  onClick={() => setEditing(editing === h.id ? null : h.id)}
                  className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
                  aria-expanded={editing === h.id}
                >
                  {editing === h.id ? L("Gotowe", "Done") : L("Zmień", "Change")}
                </button>
                <button
                  onClick={() => {
                    linkApps(h.id, []);
                    setEditing(null);
                  }}
                  className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
                >
                  {L("Odłącz", "Unlink")}
                </button>
              </div>
              {editing === h.id && (
                <AppPicker
                  habit={h}
                  selected={h.apps ?? []}
                  onChange={(list) => list.length > 0 && link(h, list)}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
