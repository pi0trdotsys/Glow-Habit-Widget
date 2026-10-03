import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useHabits } from "@/lib/habits/store";
import { L, plural } from "@/lib/i18n";
import { formatMinute, minuteOfDay } from "@/lib/habits/utils";
import { Toggle } from "@/components/HabitForm";
import { busySummary, groupByAccount, type DeviceCalendar } from "@/lib/calendar";
import {
  calendarGranted,
  listCalendars,
  openCalendarApp,
  refreshCalendar,
  requestCalendar,
  useBusyToday,
} from "@/lib/calendar-device";

const meetingsWord = (n: number) =>
  plural(n, ["spotkanie", "spotkania", "spotkań"], ["meeting", "meetings"]);

/**
 * Settings → Notifications: "Kalendarz". Connect the phone's calendars
 * (READ_CALENDAR), pick any number of them (grouped by account - the work one
 * too, once it syncs to the phone), see today's busy time and switch the two
 * effects: no jabs during meetings, free-window hints.
 */
export function CalendarCard({ onMessage }: { onMessage: (m: string) => void }) {
  const ids = useHabits((s) => s.calendars);
  const setCalendars = useHabits((s) => s.setCalendars);
  const notif = useHabits((s) => s.notifications);
  const setNotifications = useHabits((s) => s.setNotifications);
  const [granted, setGranted] = useState<boolean | null>(null);
  const [cals, setCals] = useState<DeviceCalendar[] | null>(null);
  const { busy, events } = useBusyToday();

  const refresh = async () => {
    const g = await calendarGranted();
    setGranted(g);
    setCals(g ? await listCalendars() : []);
    if (g) void refreshCalendar();
  };
  useEffect(() => {
    void refresh();
    // Back from Outlook / account settings: a new calendar may have synced.
    const onVis = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!Capacitor.isNativePlatform()) return null;

  const toggleCal = (id: string, on: boolean) => {
    setCalendars(on ? [...ids, id] : ids.filter((x) => x !== id));
    setTimeout(() => void refreshCalendar(), 50);
  };
  const now = minuteOfDay();
  const sum = busySummary(busy, now, 1440);
  const upcoming = events
    .filter((e) => !e.allDay && !e.declined && e.availability !== "free")
    .filter((e) => e.end > now && e.start < 1440)
    .sort((a, b) => a.start - b.start)
    .slice(0, 4);
  // Picked calendars that disappeared (account removed) still count until unticked.
  const known = new Set((cals ?? []).map((c) => c.id));
  const missing = ids.filter((id) => cals && !known.has(id));

  return (
    <div className="rounded-2xl bg-card p-4" data-calendar-card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <CalendarDays size={18} className="text-primary" />
          <span className="font-medium">{L("Kalendarz", "Calendar")}</span>
        </div>
        {granted === false && (
          <button
            onClick={async () => {
              const ok = await requestCalendar();
              await refresh();
              onMessage(
                ok
                  ? L(
                      "Kalendarz połączony. Wybierz kalendarze.",
                      "Calendar connected. Pick your calendars.",
                    )
                  : L(
                      "Brak zgody na kalendarz. Włączysz ją w ustawieniach aplikacji.",
                      "No calendar permission. You can turn it on in the app's settings.",
                    ),
              );
            }}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
            data-calendar-connect
          >
            {L("Połącz", "Connect")}
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {L(
          "Szpila patrzy w twój kalendarz zamiast zgadywać: milczy w trakcie spotkań i podpowiada wolne okienka. Czyta tylko godziny zajętości (tytuły widzisz tylko tutaj) i nic nie wysyła.",
          "Szpila looks at your calendar instead of guessing: quiet during meetings, hints for free slots. It only reads busy times (titles are shown only here) and sends nothing anywhere.",
        )}
      </p>

      {granted && cals && (
        <>
          <div className="mt-3 space-y-3" role="group" aria-label={L("Kalendarze", "Calendars")}>
            {groupByAccount(cals).map((g) => (
              <div key={g.key} data-calendar-account={g.title}>
                <div className="truncate text-xs font-semibold text-muted-foreground">
                  {g.title} · {g.kind}
                </div>
                <div className="mt-1.5 space-y-1">
                  {g.calendars.map((c) => {
                    const on = ids.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2"
                        style={{ borderColor: on ? "var(--primary)" : "var(--border)" }}
                        data-calendar={c.id}
                      >
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => toggleCal(c.id, e.target.checked)}
                          className="h-4 w-4 shrink-0 accent-[var(--primary)]"
                        />
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: c.color }}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {c.name || L("(bez nazwy)", "(no name)")}
                        </span>
                        {!c.visible && (
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {L("ukryty", "hidden")}
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
            {cals.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {L(
                  "Na telefonie nie ma jeszcze żadnego kalendarza.",
                  "There are no calendars on this phone yet.",
                )}
              </p>
            )}
            {missing.length > 0 && (
              <button
                onClick={() => setCalendars(ids.filter((id) => known.has(id)))}
                className="text-xs text-muted-foreground underline"
              >
                {L(
                  `Usuń ${missing.length} niedostępne (konto usunięte z telefonu)`,
                  `Remove ${missing.length} unavailable (account removed from the phone)`,
                )}
              </button>
            )}
          </div>

          <details
            className="mt-3 rounded-xl border border-border p-3 text-xs text-muted-foreground"
            data-calendar-help
          >
            <summary className="cursor-pointer font-semibold text-foreground">
              {L("Nie widzę kalendarza służbowego", "My work calendar isn't here")}
            </summary>
            <ul className="mt-2 list-disc space-y-1.5 pl-4">
              <li>
                {L(
                  "Outlook (Microsoft 365 / Exchange): w aplikacji Outlook otwórz Ustawienia → konto służbowe → włącz „Synchronizuj kalendarze”. Kalendarz pojawi się tu jako konto Outlook.",
                  "Outlook (Microsoft 365 / Exchange): in the Outlook app open Settings → your work account → turn on “Sync calendars”. It shows up here as an Outlook account.",
                )}
              </li>
              <li>
                {L(
                  "Google Workspace: Ustawienia telefonu → Konta → dodaj konto firmowe Google i włącz synchronizację Kalendarza.",
                  "Google Workspace: phone Settings → Accounts → add the work Google account and turn on Calendar sync.",
                )}
              </li>
              <li>
                {L(
                  "Inne Exchange: dodaj konto Exchange w ustawieniach kont telefonu (lub w aplikacji poczty producenta) z synchronizacją kalendarza.",
                  "Other Exchange: add an Exchange account in the phone's account settings (or the maker's mail app) with calendar sync on.",
                )}
              </li>
              <li>
                {L(
                  "Jeśli firma blokuje synchronizację (Intune), kalendarz nie trafi do telefonu - wtedy Szpila go nie zobaczy.",
                  "If your company blocks syncing (Intune), the calendar never reaches the phone - then Szpila can't see it either.",
                )}
              </li>
            </ul>
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => void refresh()}
                className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 font-semibold text-foreground"
              >
                <RefreshCw size={12} /> {L("Odśwież listę", "Refresh list")}
              </button>
              <button
                onClick={async () => {
                  if (!(await openCalendarApp()))
                    onMessage(
                      L("Nie udało się otworzyć kalendarza.", "Couldn't open the calendar."),
                    );
                }}
                className="rounded-full border border-border px-3 py-1.5 font-semibold text-foreground"
              >
                {L("Otwórz kalendarz", "Open calendar")}
              </button>
            </div>
          </details>

          {ids.length > 0 && (
            <div className="mt-3 rounded-xl border border-border p-3 text-xs" data-calendar-today>
              <div className="font-semibold">
                {sum.count === 0
                  ? L("Do końca dnia wolne.", "Free for the rest of the day.")
                  : L(
                      `Dziś jeszcze ${sum.count} ${meetingsWord(sum.count)} · ${sum.minutes} min zajęte`,
                      `${sum.count} more ${meetingsWord(sum.count)} today · ${sum.minutes} min busy`,
                    )}
              </div>
              {upcoming.length > 0 && (
                <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                  {upcoming.map((e, i) => (
                    <li key={i} className="truncate">
                      <span className="tabular-nums">
                        {formatMinute(Math.max(0, e.start))}–{formatMinute(Math.min(1439, e.end))}
                      </span>{" "}
                      {e.title || L("zajęte", "busy")}
                      {e.availability === "tentative" ? L(" (może)", " (maybe)") : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {L("Nie szpiluj w trakcie spotkań", "No jabs during meetings")}
          </div>
          <div className="text-xs text-muted-foreground">
            {L(
              "Szpila przesuwa szpilę na pierwszą wolną minutę po spotkaniu (albo ją odpuszcza, jeśli spotkanie trwa do następnej).",
              "A jab moves to the first free minute after the meeting (or is dropped if the meeting runs into the next one).",
            )}
          </div>
        </div>
        <Toggle
          checked={notif.meetingQuiet}
          onChange={(on) => {
            setNotifications({ ...notif, meetingQuiet: on });
          }}
        />
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {L("Podpowiadaj wolne okna", "Suggest free windows")}
          </div>
          <div className="text-xs text-muted-foreground">
            {L(
              "Na ekranie Dziś: „Masz 18:10–18:50 wolne — idealne na 30 min”. Godziny w planie omijają spotkania, a raz dziennie szpila podpowie okienko.",
              "On Today: “You're free 18:10–18:50 — perfect for 30 min”. Plan times skip meetings, and once a day a jab suggests the slot.",
            )}
          </div>
        </div>
        <Toggle
          checked={notif.freeWindows}
          onChange={(on) => {
            setNotifications({ ...notif, freeWindows: on });
          }}
        />
      </div>
      {granted && ids.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {L(
            "Zaznacz co najmniej jeden kalendarz, żeby to działało.",
            "Tick at least one calendar for this to work.",
          )}
        </p>
      )}
    </div>
  );
}
