import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ChevronDown, Moon, Search } from "lucide-react";
import { addDays } from "date-fns";
import { Toggle } from "@/components/HabitForm";
import { useHabits } from "@/lib/habits/store";
import {
  curfewApps,
  liveStatus,
  openOverlaySettings,
  type CurfewApp,
  type LiveStatus,
} from "@/lib/live";
import { CURFEW_PASS_MIN, DEBT_PER_PASS, DEBT_PER_SOCIAL_MIN, DEBT_FLOOR_MIN } from "@/lib/curfew";
import { refreshNative } from "@/lib/widget/bridge";
import { todayKey } from "@/lib/habits/utils";
import { L } from "@/lib/i18n";
import { isBank } from "@/lib/bank";

/**
 * Settings → Guard: "Cisza nocna". After the deadline only the alarm, calls,
 * the home screen and the allow list work; everything else is blocked at once.
 */
export function CurfewCard() {
  const notif = useHabits((s) => s.notifications);
  const setNotifications = useHabits((s) => s.setNotifications);
  const [st, setSt] = useState<LiveStatus | null>(null);
  const [apps, setApps] = useState<CurfewApp[] | null>(null);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  useEffect(() => {
    const load = () => void liveStatus().then(setSt);
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  useEffect(() => {
    if (open && apps == null) void curfewApps().then(setApps);
  }, [open, apps]);

  const allowed = useMemo(() => new Set(notif.curfewAllow ?? []), [notif.curfewAllow]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (apps ?? [])
      .filter((a) => !needle || a.label.toLowerCase().includes(needle))
      .sort((a, b) => Number(allowed.has(b.pkg)) - Number(allowed.has(a.pkg)));
  }, [apps, q, allowed]);

  if (!Capacitor.isNativePlatform()) return null;
  const update = (patch: Partial<typeof notif>) => {
    setNotifications({ ...notif, ...patch });
    refreshNative();
  };
  const toggleApp = (pkg: string) =>
    update({
      curfewAllow: allowed.has(pkg) ? [...allowed].filter((p) => p !== pkg) : [...allowed, pkg],
    });
  const now = new Date();
  const night = todayKey(now.getHours() < 12 ? addDays(now, -1) : now);
  const blocks = st?.curfewBlocks?.[night] ?? 0;
  const passes = st?.curfewPasses?.[night] ?? 0;
  const labelOf = (pkg: string) => apps?.find((a) => a.pkg === pkg)?.label ?? pkg.split(".").pop();

  return (
    <div className="rounded-2xl bg-card p-4" data-curfew>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Moon size={18} style={{ color: "var(--avoid)" }} />
          <span className="font-medium">
            {L(`Cisza nocna od ${notif.liveFrom}`, `Curfew from ${notif.liveFrom}`)}
          </span>
        </div>
        <Toggle
          checked={notif.curfew}
          disabled={!notif.live}
          onChange={(on) => update({ curfew: on })}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {L(
          `Od ${notif.liveFrom} do ${notif.liveUntil} działa tylko budzik, telefon, ekran główny i to, co dopuścisz. Każda inna aplikacja zasłania się od razu, bez trzech szpil. Pilne? Przytrzymaj 10 s (każdy kolejny raz dwa razy dłużej), a dostaniesz ${CURFEW_PASS_MIN} min przy ciemniejącym ekranie.`,
          `From ${notif.liveFrom} to ${notif.liveUntil} only the alarm, calls, the home screen and what you allow work. Any other app is covered at once, no three jabs first. Urgent? Hold for 10 s (twice as long each next time) for ${CURFEW_PASS_MIN} min on a darkening screen.`,
        )}
        {!notif.live && L(" Wymaga Szpili na żywo.", " Needs the night guard.")}
        {notif.curfew && (blocks > 0 || passes > 0)
          ? L(
              ` Tej nocy: ${blocks}× blokada, ${passes}× wyjątek.`,
              ` Tonight: ${blocks}× blocked, ${passes}× urgent pass.`,
            )
          : ""}
      </p>

      {notif.curfew && st?.overlay === false && (
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-xl p-3"
          style={{ backgroundColor: "color-mix(in oklab, var(--avoid) 14%, transparent)" }}
        >
          <span className="text-xs">
            {L(
              "Bez zgody „Wyświetlanie nad innymi aplikacjami” zostają same szpile.",
              "Without “Display over other apps” it's jabs only.",
            )}
          </span>
          <button
            onClick={() => void openOverlaySettings()}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--avoid)", color: "var(--primary-foreground)" }}
          >
            {L("Zezwól", "Allow")}
          </button>
        </div>
      )}

      {notif.curfew && (
        <>
          <ul
            className="mt-3 space-y-1.5 rounded-xl border border-border p-3 text-xs"
            data-curfew-why
          >
            <li>
              🔌{" "}
              {L(
                "Wieczorem telefon na ładowarkę, najlepiej poza łóżkiem. Szpila to zauważy i pochwali, a odłączenie w nocy skończy się szpilą.",
                "In the evening, put the phone on the charger, ideally away from the bed. Szpila notices and praises it; unplugging at night gets a jab.",
              )}
            </li>
            <li>
              🧱{" "}
              {L(
                "Tarcie zamiast silnej woli: o północy nie wygrasz z algorytmem, więc nie musisz z nim walczyć.",
                "Friction beats willpower: at midnight you won't beat the algorithm, so you don't have to fight it.",
              )}
            </li>
            <li>
              🔥{" "}
              {L(
                "Każda czysta noc wydłuża serię na rachunku za noc. Szkoda ją przerwać.",
                "Every clean night grows the streak on the night bill. Shame to break it.",
              )}
            </li>
          </ul>

          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="mt-3 flex w-full items-center justify-between rounded-xl border border-border px-3 py-2 text-left"
            aria-expanded={open}
            data-curfew-allow-toggle
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">
                {L("Dozwolone w nocy", "Allowed at night")} ({allowed.size})
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {allowed.size
                  ? [...allowed].map(labelOf).join(", ")
                  : L(
                      "np. muzyka, aplikacja do snu, komunikator",
                      "e.g. music, a sleep app, a messenger",
                    )}
              </span>
            </span>
            <ChevronDown
              size={16}
              className="shrink-0 transition"
              style={{ transform: open ? "rotate(180deg)" : undefined }}
            />
          </button>
          {open && (
            <div className="mt-2 rounded-xl border border-border p-2" data-curfew-apps>
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
                  <div className="p-2 text-xs text-muted-foreground">
                    {L("Wczytuję…", "Loading…")}
                  </div>
                )}
                {shown.map((a) => {
                  const on = allowed.has(a.pkg);
                  return (
                    <button
                      key={a.pkg}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      data-curfew-app={a.pkg}
                      onClick={() => toggleApp(a.pkg)}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm"
                      style={{
                        backgroundColor: on
                          ? "color-mix(in oklab, var(--primary) 12%, transparent)"
                          : "transparent",
                      }}
                    >
                      <span className="min-w-0 truncate">
                        {a.label}
                        {a.social && (
                          <span className="ml-1.5 text-xs" style={{ color: "var(--avoid)" }}>
                            {L("social media", "social media")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs font-semibold">
                        {on ? L("✓ dozwolona", "✓ allowed") : L("blokowana", "blocked")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                {L("Przyciemniaj przy wyjątku", "Darken during a pass")}
              </div>
              <div className="text-xs text-muted-foreground">
                {L(
                  "Przez te 3 minuty ekran gęstnieje ciemną czerwienią. Da się, ale nie ma przyjemności.",
                  "For those 3 minutes the screen thickens with a dark red veil. Usable, but no fun.",
                )}
              </div>
            </div>
            <Toggle checked={notif.curfewDim} onChange={(on) => update({ curfewDim: on })} />
          </div>
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {L("Noc kosztuje dzień", "The night costs the day")}
          </div>
          <div className="text-xs text-muted-foreground">
            {isBank(notif)
              ? L(
                  `Każda minuta social mediów po północy zabiera ${DEBT_PER_SOCIAL_MIN} min z banku minut, każdy wyjątek ${DEBT_PER_PASS} min (bank może spaść do zera).`,
                  `Every social media minute after midnight takes ${DEBT_PER_SOCIAL_MIN} min out of the minute bank, every urgent pass ${DEBT_PER_PASS} min (the bank can drop to zero).`,
                )
              : L(
                  `Każda minuta social mediów po północy zabiera ${DEBT_PER_SOCIAL_MIN} min z dziennego limitu, każdy wyjątek ${DEBT_PER_PASS} min (zostaje co najmniej ${DEBT_FLOOR_MIN}).`,
                  `Every social media minute after midnight takes ${DEBT_PER_SOCIAL_MIN} min off the next day's limit, every urgent pass ${DEBT_PER_PASS} min (at least ${DEBT_FLOOR_MIN} stay).`,
                )}
            {st?.debt ? L(` Dziś: −${st.debt} min.`, ` Today: −${st.debt} min.`) : ""}
          </div>
        </div>
        <Toggle
          checked={notif.nightDebt}
          disabled={!notif.dailyLimit}
          onChange={(on) => update({ nightDebt: on })}
        />
      </div>
    </div>
  );
}
