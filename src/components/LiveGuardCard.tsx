import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Siren } from "lucide-react";
import { Toggle } from "@/components/HabitForm";
import { useHabits } from "@/lib/habits/store";
import { liveStatus, minutesTo, openOverlaySettings, type LiveStatus } from "@/lib/live";

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
import { openUsageSettings } from "@/lib/sensors";
import { refreshNative } from "@/lib/widget/bridge";
import { todayKey } from "@/lib/habits/utils";
import { addDays } from "date-fns";
import { L } from "@/lib/i18n";

/** Settings: "Szpila na żywo" - the night guard for social media (Android). */
export function LiveGuardCard() {
  const notif = useHabits((s) => s.notifications);
  const setNotifications = useHabits((s) => s.setNotifications);
  const [st, setSt] = useState<LiveStatus | null>(null);

  useEffect(() => {
    const load = () => void liveStatus().then(setSt);
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!Capacitor.isNativePlatform()) return null;
  const granted = st?.granted ?? true;
  const installed = st?.apps.filter((a) => a.installed) ?? [];
  const now = new Date();
  // Visits are counted for the evening's day (before noon = last night).
  const night = todayKey(now.getHours() < 12 ? addDays(now, -1) : now);
  const tonight = st?.hits[night] ?? 0;

  const bedLead = minutesTo(toMin(notif.bedtimeAt), toMin(notif.liveFrom));

  const update = (patch: Partial<typeof notif>) => {
    setNotifications({ ...notif, ...patch });
    refreshNative();
  };

  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Siren size={18} style={{ color: "var(--avoid)" }} />
          <span className="font-medium">{L("Szpila na żywo (noc)", "Night guard")}</span>
        </div>
        <Toggle checked={notif.live} onChange={(on) => update({ live: on })} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {L(
          "Gdy w nocy otworzysz social media, Szpila wyskakuje od razu, a nie dopiero rano w ocenie. Siedzisz dalej - co 5 min dostajesz ostrzejszą szpilę.",
          "Open social media at night and Szpila pops up right away, not in tomorrow's review. Keep scrolling and every 5 min you get a sharper jab.",
        )}
        {st?.running ? L(" Teraz czuwa.", " On watch now.") : ""}
        {tonight > 0
          ? L(` Tej nocy: ${tonight}× social media.`, ` Tonight: ${tonight}× social media.`)
          : ""}
      </p>
      {!granted && (
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-xl p-3"
          style={{ backgroundColor: "color-mix(in oklab, var(--avoid) 14%, transparent)" }}
        >
          <span className="text-xs">
            {L("Wymaga „dostępu do danych o użyciu”.", "Needs “usage access”.")}
          </span>
          <button
            onClick={() => void openUsageSettings()}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--avoid)", color: "var(--primary-foreground)" }}
          >
            {L("Otwórz", "Open")}
          </button>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">{L("Tryb przed snem", "Bedtime mode")}</div>
          <div className="text-xs text-muted-foreground">
            {L(
              `O tej porze Szpila przypomina „odłóż telefon za ${bedLead} min” i od razu zaczyna pilnować social mediów, odliczając do ${notif.liveFrom}.`,
              `At this time Szpila says “put the phone down in ${bedLead} min” and starts watching social media right away, counting down to ${notif.liveFrom}.`,
            )}
          </div>
        </div>
        <Toggle checked={notif.bedtime} onChange={(on) => update({ bedtime: on })} />
      </div>
      {notif.bedtime && (
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {L("Przypomnienie o", "Reminder at")}
          </span>
          <TimeField value={notif.bedtimeAt} onChange={(v) => update({ bedtimeAt: v })} />
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {L("Blokada po 3. szpili", "Block after the 3rd jab")}
          </div>
          <div className="text-xs text-muted-foreground">
            {L(
              "Dalej siedzisz? Pełnoekranowy kot zasłania aplikację: „Idę spać” albo przytrzymaj 10 s, jeśli naprawdę musisz. W trybie przed snem już po 2. szpili.",
              "Still at it? A full-screen cat covers the app: tap “Going to bed” or hold for 10 s if you really must. In bedtime mode after the 2nd jab already.",
            )}
          </div>
        </div>
        <Toggle checked={notif.liveBlock} onChange={(on) => update({ liveBlock: on })} />
      </div>
      {notif.liveBlock && st?.overlay === false && (
        <div
          className="mt-3 flex items-center justify-between gap-3 rounded-xl p-3"
          style={{ backgroundColor: "color-mix(in oklab, var(--avoid) 14%, transparent)" }}
        >
          <span className="text-xs">
            {L(
              "Blokada wymaga zgody „Wyświetlanie nad innymi aplikacjami”.",
              "The block needs the “Display over other apps” permission.",
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
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {L("Czuwa od - do", "On watch from - to")}
        </span>
        <div className="flex items-center gap-2">
          <TimeField
            value={notif.liveFrom}
            disabled={!notif.live}
            onChange={(v) => update({ liveFrom: v })}
          />
          <span className="text-xs text-muted-foreground">-</span>
          <TimeField
            value={notif.liveUntil}
            disabled={!notif.live}
            onChange={(v) => update({ liveUntil: v })}
          />
        </div>
      </div>
      {installed.length > 0 && (
        <>
          <div className="mt-4 text-xs text-muted-foreground">
            {L("Pilnowane aplikacje", "Watched apps")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {installed.map((a) => {
              const on = !notif.liveOff.includes(a.pkg);
              return (
                <button
                  key={a.pkg}
                  disabled={!notif.live}
                  onClick={() =>
                    update({
                      liveOff: on
                        ? [...notif.liveOff, a.pkg]
                        : notif.liveOff.filter((p) => p !== a.pkg),
                    })
                  }
                  className="rounded-full border px-3 py-1 text-xs font-medium transition disabled:opacity-50"
                  style={{
                    borderColor: on ? "var(--avoid)" : "var(--border)",
                    backgroundColor: on
                      ? "color-mix(in oklab, var(--avoid) 16%, transparent)"
                      : "transparent",
                    color: on ? "var(--foreground)" : "var(--muted-foreground)",
                  }}
                >
                  {on ? "👁 " : ""}
                  {a.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function TimeField({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <input
      type="time"
      value={value}
      disabled={disabled}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none disabled:opacity-50"
    />
  );
}
