import { createFileRoute } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { useEffect, useRef, useState } from "react";
import {
  Download,
  Upload,
  RotateCcw,
  Smartphone,
  Bell,
  User,
  CalendarCheck,
  Flame,
  BarChart3,
  Share2,
  ShieldCheck,
  Moon,
  ClipboardCheck,
  Footprints,
  PhoneOff,
} from "lucide-react";
import {
  openUsageSettings,
  requestSteps,
  screenGranted,
  stepsStatus,
  syncSensors,
  type StepsStatus,
} from "@/lib/sensors";
import { SzpilaAvatar } from "@/components/Szpila";
import { LiveGuardCard } from "@/components/LiveGuardCard";
import { DayGuardCard } from "@/components/DayGuardCard";
import { LanguageCard } from "@/components/LanguageCard";
import { ThemeCard } from "@/components/ThemeCard";
import { SettingsTabs, parseTab, type SettingsTab } from "@/components/SettingsTabs";
import { Toggle } from "@/components/HabitForm";
import { AppShell } from "@/components/AppShell";
import { useHabits } from "@/lib/habits/store";
import { lastAutoBackup, restoreBackup, saveBackup } from "@/lib/backup";
import { pinWidget, type WidgetKind } from "@/lib/widget/bridge";
import {
  getPermissionState,
  requestNotificationPermission,
  tauntSlots,
  type PermissionState,
} from "@/lib/notifications";
import { formatMinute } from "@/lib/habits/utils";
import { L, pick } from "@/lib/i18n";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: L("Ustawienia - Szpila", "Settings - Szpila") }] }),
  // ?tab=guard etc. - so Back and links land on the right section
  validateSearch: (s: Record<string, unknown>): { tab?: SettingsTab } =>
    s.tab == null ? {} : { tab: parseTab(s.tab) },
  component: SettingsPage,
});

/** Weekday names, Sunday first (index = Date.getDay()). */
const dayNames = () =>
  pick(
    ["Niedziela", "Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota"],
    ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  );

function SettingsPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const tab = parseTab(search.tab);
  const setTab = (t: SettingsTab) => {
    void navigate({ search: { tab: t }, replace: true });
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };
  const reset = useHabits((s) => s.reset);
  const userName = useHabits((s) => s.userName);
  const setUserName = useHabits((s) => s.setUserName);
  const notif = useHabits((s) => s.notifications);
  const setNotifications = useHabits((s) => s.setNotifications);
  const [nameDraft, setNameDraft] = useState(userName ?? "");
  useEffect(() => setNameDraft(userName ?? ""), [userName]);

  const [permission, setPermission] = useState<PermissionState>("default");

  useEffect(() => {
    void getPermissionState().then(setPermission);
  }, []);

  // Turning any reminder on needs permission first; grab it lazily.
  const ensurePermission = async (): Promise<boolean> => {
    let p = permission;
    if (p !== "granted") {
      p = await requestNotificationPermission();
      setPermission(p);
    }
    if (p !== "granted") setMsg(L("Nie zezwolono na powiadomienia.", "Notifications not allowed."));
    return p === "granted";
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const autoBackup = useHabits((s) => s.autoBackup);
  const setAutoBackup = useHabits((s) => s.setAutoBackup);
  const [lastAuto, setLastAuto] = useState("");
  useEffect(() => {
    void lastAutoBackup().then(setLastAuto);
  }, []);

  const doExport = async (share: boolean) => {
    try {
      const where = await saveBackup(share);
      setMsg(L(`Zapisano kopię: ${where}`, `Backup saved: ${where}`));
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const doImport = async (file: File) => {
    if (
      !confirm(
        L(
          "Przywrócenie zastąpi obecne zadania i historię danymi z kopii. Kontynuować?",
          "Restoring replaces your current habits and history with the backup. Continue?",
        ),
      )
    )
      return;
    try {
      const n = await restoreBackup(file);
      setMsg(
        L(
          `Przywrócono ${n} zadań z kopii.`,
          `Restored ${n} ${n === 1 ? "habit" : "habits"} from the backup.`,
        ),
      );
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-6">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          {L("Ustawienia", "Settings")}
        </h1>
      </header>

      <div className="space-y-3 px-5">
        <SettingsTabs tab={tab} onChange={setTab} />
        {tab === "szpila" && (
          <div className="space-y-3" data-tab-panel="szpila">
            <LanguageCard />

            <ThemeCard />

            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center gap-3">
                <User size={18} className="text-primary" />
                <span className="font-medium">{L("Twoje imię", "Your name")}</span>
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={24}
                  placeholder={L("Twoje imię", "Your name")}
                  className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  onClick={() => {
                    setUserName(nameDraft);
                    setMsg(L("Zapisano.", "Saved."));
                  }}
                  className="rounded-xl px-4 text-sm font-medium"
                  style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
                >
                  {L("Zapisz", "Save")}
                </button>
              </div>
            </div>

            <div
              className="rounded-2xl p-4"
              style={{
                background: "color-mix(in oklab, var(--avoid) 10%, var(--card))",
                border: "1px solid color-mix(in oklab, var(--avoid) 25%, transparent)",
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SzpilaAvatar mood="smug" size={28} />
                  <span className="font-medium">
                    {L("Szpila - złośliwy towarzysz", "Szpila - your spiteful sidekick")}
                  </span>
                </div>
                <Toggle
                  checked={notif.taunts}
                  disabled={permission === "unsupported"}
                  onChange={async (on) => {
                    if (!on || (await ensurePermission()))
                      setNotifications({ ...notif, taunts: on });
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {pick(
                  <>
                    Wbija szpile w ciągu dnia ({tauntWindow(notif.quietTo, notif.quietFrom)}), gdy
                    zadania leżą albo nie potwierdzisz zakazanych. Teksty są dopasowane do
                    konkretnego zadania.
                  </>,
                  <>
                    Jabs you during the day ({tauntWindow(notif.quietTo, notif.quietFrom)}) when
                    habits are slacking or you haven&apos;t confirmed your forbidden ones. Every
                    line is tailored to the specific habit.
                  </>,
                )}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {(
                  [
                    ["hard", L("Wulgarny 🤬", "Foul-mouthed 🤬")],
                    ["soft", L("Łagodny 🙂", "Gentle 🙂")],
                  ] as const
                ).map(([v, label]) => (
                  <button
                    key={v}
                    onClick={() => setNotifications({ ...notif, tauntLevel: v })}
                    className="rounded-full py-2 text-xs font-semibold"
                    style={{
                      backgroundColor:
                        notif.tauntLevel === v ? "var(--avoid)" : "var(--background)",
                      color:
                        notif.tauntLevel === v ? "var(--primary-foreground)" : "var(--foreground)",
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  {L("Szpil dziennie", "Jabs per day")}
                </span>
                <div className="flex gap-1.5">
                  {[3, 5, 8].map((n) => (
                    <button
                      key={n}
                      onClick={() => setNotifications({ ...notif, tauntsPerDay: n })}
                      disabled={!notif.taunts}
                      className="h-8 w-10 rounded-full text-xs font-semibold disabled:opacity-40"
                      style={{
                        backgroundColor:
                          notif.tauntsPerDay === n ? "var(--avoid)" : "var(--background)",
                        color:
                          notif.tauntsPerDay === n
                            ? "var(--primary-foreground)"
                            : "var(--foreground)",
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center gap-3">
                <Moon size={18} className="text-primary" />
                <span className="font-medium">{L("Tryb snu", "Sleep mode")}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {L("Cisza od - do", "Quiet from - to")}
                </span>
                <div className="flex items-center gap-2">
                  <TimeInput
                    value={notif.quietFrom}
                    onChange={(v) => setNotifications({ ...notif, quietFrom: v })}
                  />
                  <span className="text-muted-foreground">-</span>
                  <TimeInput
                    value={notif.quietTo}
                    onChange={(v) => setNotifications({ ...notif, quietTo: v })}
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {L(
                  "W tych godzinach Szpila milczy, a szpile rozkładają się równo między pobudką a snem. Wyjątek: przyłapanie na telefonie po nocy.",
                  "Szpila stays quiet during these hours, and jabs are spread evenly between wake-up and bedtime. Exception: getting caught on your phone late at night.",
                )}
              </p>
            </div>
          </div>
        )}
        {tab === "guard" && (
          <div className="space-y-3" data-tab-panel="guard">
            <SensorsCard onMessage={setMsg} />

            <LiveGuardCard />

            <DayGuardCard />
          </div>
        )}
        {tab === "notifications" && (
          <div className="space-y-3" data-tab-panel="notifications">
            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <BarChart3 size={18} className="text-primary" />
                  <span className="font-medium">
                    {L("Postęp dnia w powiadomieniu", "Daily progress notification")}
                  </span>
                </div>
                <Toggle
                  checked={notif.progress}
                  disabled={permission === "unsupported"}
                  onChange={async (on) => {
                    if (!on || (await ensurePermission()))
                      setNotifications({ ...notif, progress: on });
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {L(
                  "Stałe, ciche powiadomienie z paskiem postępu wykonanych dziś zadań i planem, jak skończyć dzień (Android).",
                  "A persistent, silent notification with a progress bar for today's habits and a plan to finish the day (Android).",
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ClipboardCheck size={18} className="text-primary" />
                  <span className="font-medium">
                    {L("Wieczorne rozliczenie", "Evening check-in")}
                  </span>
                </div>
                <Toggle
                  checked={notif.review}
                  disabled={permission === "unsupported"}
                  onChange={async (on) => {
                    if (!on || (await ensurePermission()))
                      setNotifications({ ...notif, review: on });
                  }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{L("Godzina", "Time")}</span>
                <TimeInput
                  value={notif.reviewAt}
                  disabled={!notif.review}
                  onChange={(v) => setNotifications({ ...notif, reviewAt: v })}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {L(
                  "Jedno powiadomienie z przyciskami „Wszystko czysto” / „Wpadka” dla wszystkich niepotwierdzonych zakazanych.",
                  "One notification with “All clean” / “Slip” buttons for all your unconfirmed forbidden habits.",
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell size={18} className="text-primary" />
                  <span className="font-medium">
                    {L("Codzienne przypomnienie", "Daily reminder")}
                  </span>
                </div>
                <Toggle
                  checked={notif.enabled}
                  disabled={permission === "unsupported"}
                  onChange={async (on) => {
                    if (on) {
                      if (await ensurePermission()) {
                        setNotifications({ ...notif, enabled: true });
                      }
                    } else {
                      setNotifications({ ...notif, enabled: false });
                    }
                  }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{L("Godzina", "Time")}</span>
                <input
                  type="time"
                  value={notif.time}
                  onChange={(e) => setNotifications({ ...notif, time: e.target.value })}
                  disabled={!notif.enabled}
                  className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none disabled:opacity-50"
                />
              </div>
              {permission === "denied" && (
                <p className="mt-2 text-xs text-destructive">
                  {L(
                    "Powiadomienia są zablokowane. Włącz je w ustawieniach systemu.",
                    "Notifications are blocked. Turn them on in system settings.",
                  )}
                </p>
              )}
              {permission === "unsupported" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {L(
                    "Twoja przeglądarka nie obsługuje powiadomień.",
                    "Your browser doesn't support notifications.",
                  )}
                </p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                {L(
                  "Godzinę dla konkretnego zadania ustawisz w jego edycji.",
                  "Set a time for a specific habit when editing it.",
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CalendarCheck size={18} className="text-primary" />
                  <span className="font-medium">{L("Podsumowanie tygodnia", "Weekly recap")}</span>
                </div>
                <Toggle
                  checked={notif.weeklyReport}
                  disabled={permission === "unsupported"}
                  onChange={async (on) => {
                    if (on) {
                      if (await ensurePermission()) {
                        setNotifications({ ...notif, weeklyReport: true });
                      }
                    } else {
                      setNotifications({ ...notif, weeklyReport: false });
                    }
                  }}
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  {L("Dzień i godzina", "Day and time")}
                </span>
                <div className="flex gap-2">
                  <select
                    value={notif.reportDay}
                    onChange={(e) =>
                      setNotifications({ ...notif, reportDay: Number(e.target.value) })
                    }
                    disabled={!notif.weeklyReport}
                    className="rounded-xl border border-border bg-background px-2 py-1.5 text-sm outline-none disabled:opacity-50"
                  >
                    {dayNames().map((d, i) => (
                      <option key={i} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <input
                    type="time"
                    value={notif.reportTime}
                    onChange={(e) => setNotifications({ ...notif, reportTime: e.target.value })}
                    disabled={!notif.weeklyReport}
                    className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none disabled:opacity-50"
                  />
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {L(
                  "Raz w tygodniu: jak ci idzie w porównaniu z zeszłym tygodniem.",
                  "Once a week: how you're doing compared to last week.",
                )}
              </p>
            </div>

            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Flame size={18} className="text-primary" />
                  <span className="font-medium">{L("Tydzień do tygodnia", "Week vs week")}</span>
                </div>
                <Toggle
                  checked={notif.boosts}
                  disabled={permission === "unsupported"}
                  onChange={async (on) => {
                    if (on) {
                      if (await ensurePermission()) {
                        setNotifications({ ...notif, boosts: true });
                      }
                    } else {
                      setNotifications({ ...notif, boosts: false });
                    }
                  }}
                />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {L(
                  "W południe i wieczorem: ten tydzień vs zeszły o tej samej porze.",
                  "At noon and in the evening: this week vs last week at the same time.",
                )}
              </p>
            </div>

            <WidgetsCard onMessage={setMsg} />
          </div>
        )}
        {tab === "data" && (
          <div className="space-y-3" data-tab-panel="data">
            <div className="rounded-2xl bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <ShieldCheck size={18} className="text-primary" />
                  <span className="font-medium">
                    {L("Automatyczna kopia codziennie", "Daily auto-backup")}
                  </span>
                </div>
                <Toggle checked={autoBackup} onChange={setAutoBackup} />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {L(
                  "Raz dziennie zapisuje kopię do Pobrane/Szpila (po jednym pliku na dzień tygodnia, więc masz ostatnie 7 dni). Po reinstalacji przywrócisz ją przyciskiem „Przywróć z pliku”.",
                  "Saves a backup to Downloads/Szpila once a day (one file per weekday, so you always have the last 7 days). After a reinstall, bring it back with “Restore from file”.",
                )}
                {lastAuto && L(` Ostatnia: ${lastAuto}.`, ` Last one: ${lastAuto}.`)}
              </p>
            </div>
            <Action
              icon={<Download size={18} />}
              label={L("Zapisz kopię teraz", "Back up now")}
              onClick={() => void doExport(false)}
            />
            <Action
              icon={<Share2 size={18} />}
              label={L("Udostępnij kopię (Dysk, mail…)", "Share backup (Drive, email…)")}
              onClick={() => void doExport(true)}
            />
            <Action
              icon={<Upload size={18} />}
              label={L("Przywróć z pliku", "Restore from file")}
              onClick={() => fileRef.current?.click()}
            />
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) doImport(f);
                e.target.value = "";
              }}
            />
            <Action
              icon={<RotateCcw size={18} />}
              label={L("Usuń wszystkie dane", "Delete all data")}
              onClick={() => {
                if (
                  confirm(
                    L(
                      "Usunąć wszystkie zadania i historię? Tego nie da się cofnąć.",
                      "Delete all habits and history? This can't be undone.",
                    ),
                  )
                ) {
                  reset();
                  setMsg(L("Wyczyszczono.", "All cleared."));
                }
              }}
              danger
            />
          </div>
        )}
        {msg && <p className="pt-2 text-center text-xs text-muted-foreground">{msg}</p>}

        <p className="pt-10 text-center text-xs text-muted-foreground">
          {L(
            "Szpila · nawyki z pazurem · offline, bez konta",
            "Szpila · habits with claws · offline, no account",
          )}
        </p>
      </div>
    </AppShell>
  );
}

function Action({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 text-left"
      style={{ color: danger ? "var(--destructive)" : undefined }}
    >
      <span>{icon}</span>
      <span className="font-medium">{label}</span>
    </button>
  );
}
function TimeInput({
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

/** Health Connect steps + usage access for late-night screen time (Android). */
function SensorsCard({ onMessage }: { onMessage: (m: string) => void }) {
  const habits = useHabits((s) => s.habits);
  const [steps, setSteps] = useState<StepsStatus | null>(null);
  const [screen, setScreen] = useState<boolean | null>(null);

  const refresh = () => {
    void stepsStatus().then(setSteps);
    void screenGranted().then(setScreen);
  };
  useEffect(() => {
    refresh();
    // Usage access is granted in system settings - re-check when we come back.
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!Capacitor.isNativePlatform()) return null;
  const stepHabits = habits.filter((h) => h.source === "steps").length;
  const screenHabits = habits.filter((h) => h.source === "screen").length;

  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="font-medium">{L("Automatyczne śledzenie", "Auto-tracking")}</div>
      <p className="mt-1 text-xs text-muted-foreground">
        {L(
          "Włącz źródło tutaj, a potem wybierz je w edycji zadania („Kroki z Health Connect” albo „Oceniaj z czasu ekranu”).",
          "Turn a source on here, then pick it when editing a habit (“Steps from Health Connect” or “Judge by screen time”).",
        )}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <Footprints size={18} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {L("Kroki z Health Connect", "Steps from Health Connect")}
          </div>
          <div className="text-xs text-muted-foreground">
            {steps == null
              ? L("Sprawdzam…", "Checking…")
              : !steps.available
                ? L(
                    "Health Connect niedostępny na tym urządzeniu.",
                    "Health Connect isn't available on this device.",
                  )
                : steps.granted
                  ? L(
                      `Połączono${steps.background ? "" : " (bez odczytu w tle - widżet odświeży się po otwarciu aplikacji)"} · zadania: ${stepHabits}`,
                      `Connected${steps.background ? "" : " (no background reads - the widget refreshes when you open the app)"} · habits: ${stepHabits}`,
                    )
                  : L("Brak zgody na odczyt kroków.", "No permission to read steps.")}
          </div>
        </div>
        {steps?.available && !steps.granted && (
          <button
            onClick={async () => {
              const s = await requestSteps();
              setSteps(s);
              if (s.granted) {
                await syncSensors();
                onMessage(L("Połączono z Health Connect.", "Connected to Health Connect."));
              }
            }}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {L("Połącz", "Connect")}
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <PhoneOff size={18} className="shrink-0" style={{ color: "var(--avoid)" }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">
            {L("Czas ekranu w nocy", "Late-night screen time")}
          </div>
          <div className="text-xs text-muted-foreground">
            {screen == null
              ? L("Sprawdzam…", "Checking…")
              : screen
                ? L(
                    `Dostęp przyznany · zadania: ${screenHabits}`,
                    `Access granted · habits: ${screenHabits}`,
                  )
                : L(
                    "Wymaga „dostępu do danych o użyciu” w ustawieniach systemu.",
                    "Needs “usage access” in system settings.",
                  )}
          </div>
        </div>
        {screen === false && (
          <button
            onClick={() => void openUsageSettings()}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--avoid)", color: "var(--primary-foreground)" }}
          >
            {L("Otwórz", "Open")}
          </button>
        )}
      </div>
    </div>
  );
}

/** "9:30-21:30": the jab window between wake-up and bedtime (see tauntSlots). */
function tauntWindow(wake: string, bedtime: string): string {
  const slots = tauntSlots(2, toMinutes(wake), toMinutes(bedtime));
  return `${formatMinute(slots[0])}-${formatMinute(slots[1])}`;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** A function (not a constant) so the labels follow the current language. */
const widgets = (): { kind: WidgetKind; name: string; desc: string }[] => [
  {
    kind: "szpila",
    name: "Szpila 4×1",
    desc: L(
      "Wredny kot i szpila o twoich zadaniach (bez zakazanych)",
      "A mean cat jabbing you about your habits (no forbidden ones)",
    ),
  },
  {
    kind: "next",
    name: L("Następne zadanie 1×1", "Next habit 1×1"),
    desc: L("Co zrobić teraz - sam wybiera", "What to do now - it picks for you"),
  },
  {
    kind: "icons",
    name: L("Ikony 4×2", "Icons 4×2"),
    desc: L("Pierścień postępu, czas do końca dnia", "Progress ring, time left in the day"),
  },
  {
    kind: "list",
    name: L("Lista 4×2", "List 4×2"),
    desc: L("Dzisiejsze zadania jako lista", "Today's habits as a list"),
  },
];

/** Home-screen widgets with a one-tap "add" (system pin dialog). */
function WidgetsCard({ onMessage }: { onMessage: (m: string) => void }) {
  return (
    <div className="rounded-2xl bg-card p-4">
      <div className="flex items-center gap-3">
        <Smartphone size={18} className="text-primary" />
        <span className="font-medium">
          {L("Widżety na ekranie głównym", "Home-screen widgets")}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {L(
          "Dotknij „Dodaj”, a telefon zapyta, gdzie postawić widżet. Możesz też przytrzymać pusty obszar ekranu głównego → Widżety → Szpila.",
          "Tap “Add” and your phone will ask where to put the widget. You can also long-press an empty spot on the home screen → Widgets → Szpila.",
        )}
      </p>
      <ul className="mt-3 space-y-2">
        {widgets().map((w) => (
          <li key={w.kind} className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{w.name}</div>
              <div className="truncate text-xs text-muted-foreground">{w.desc}</div>
            </div>
            <button
              onClick={async () => {
                if (!Capacitor.isNativePlatform())
                  return onMessage(
                    L(
                      "Widżety działają w aplikacji na Androida.",
                      "Widgets work in the Android app.",
                    ),
                  );
                const ok = await pinWidget(w.kind);
                if (!ok)
                  onMessage(
                    L(
                      "Twój launcher nie obsługuje dodawania z aplikacji - dodaj widżet z listy widżetów.",
                      "Your launcher doesn't support adding from the app - add the widget from the widget list.",
                    ),
                  );
              }}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {L("Dodaj", "Add")}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
