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
import { Toggle } from "@/components/HabitForm";
import { AppShell } from "@/components/AppShell";
import { useHabits } from "@/lib/habits/store";
import { lastAutoBackup, restoreBackup, saveBackup } from "@/lib/backup";
import {
  getPermissionState,
  requestNotificationPermission,
  tauntSlots,
  type PermissionState,
} from "@/lib/notifications";
import { formatMinute } from "@/lib/habits/utils";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Ustawienia - Loop" }] }),
  component: SettingsPage,
});

const DAY_NAMES = [
  "Niedziela",
  "Poniedziałek",
  "Wtorek",
  "Środa",
  "Czwartek",
  "Piątek",
  "Sobota",
];

function SettingsPage() {
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
    if (p !== "granted") setMsg("Nie zezwolono na powiadomienia.");
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
      setMsg(`Zapisano kopię: ${where}`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  const doImport = async (file: File) => {
    if (!confirm("Przywrócenie zastąpi obecne zadania i historię danymi z kopii. Kontynuować?")) return;
    try {
      const n = await restoreBackup(file);
      setMsg(`Przywrócono ${n} zadań z kopii.`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-6">
        <h1 className="font-display text-4xl font-bold tracking-tight">Ustawienia</h1>
      </header>

      <div className="space-y-3 px-5">
        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center gap-3">
            <User size={18} className="text-primary" />
            <span className="font-medium">Twoje imię</span>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={24}
              placeholder="Twoje imię"
              className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <button
              onClick={() => {
                setUserName(nameDraft);
                setMsg("Zapisano.");
              }}
              className="rounded-xl px-4 text-sm font-medium"
              style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              Zapisz
            </button>
          </div>
        </div>

        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell size={18} className="text-primary" />
              <span className="font-medium">Codzienne przypomnienie</span>
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
            <span className="text-xs text-muted-foreground">Godzina</span>
            <input
              type="time"
              value={notif.time}
              onChange={(e) => setNotifications({ ...notif, time: e.target.value })}
              disabled={!notif.enabled}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none disabled:opacity-50"
            />
          </div>
          {permission === "denied" && (
            <p className="mt-2 text-[11px] text-destructive">
              Powiadomienia są zablokowane. Włącz je w ustawieniach systemu.
            </p>
          )}
          {permission === "unsupported" && (
            <p className="mt-2 text-[11px] text-muted-foreground">
              Twoja przeglądarka nie obsługuje powiadomień.
            </p>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Godzinę dla konkretnego zadania ustawisz w jego edycji.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CalendarCheck size={18} className="text-primary" />
              <span className="font-medium">Podsumowanie tygodnia</span>
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
            <span className="text-xs text-muted-foreground">Dzień i godzina</span>
            <div className="flex gap-2">
              <select
                value={notif.reportDay}
                onChange={(e) =>
                  setNotifications({ ...notif, reportDay: Number(e.target.value) })
                }
                disabled={!notif.weeklyReport}
                className="rounded-xl border border-border bg-background px-2 py-1.5 text-sm outline-none disabled:opacity-50"
              >
                {DAY_NAMES.map((d, i) => (
                  <option key={i} value={i}>
                    {d}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={notif.reportTime}
                onChange={(e) =>
                  setNotifications({ ...notif, reportTime: e.target.value })
                }
                disabled={!notif.weeklyReport}
                className="rounded-xl border border-border bg-background px-3 py-1.5 text-sm outline-none disabled:opacity-50"
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Raz w tygodniu: jak ci idzie w porównaniu z zeszłym tygodniem.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Flame size={18} className="text-primary" />
              <span className="font-medium">Tydzień do tygodnia</span>
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
          <p className="mt-2 text-[11px] text-muted-foreground">
            W południe i wieczorem: ten tydzień vs zeszły o tej samej porze.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BarChart3 size={18} className="text-primary" />
              <span className="font-medium">Postęp dnia w powiadomieniu</span>
            </div>
            <Toggle
              checked={notif.progress}
              disabled={permission === "unsupported"}
              onChange={async (on) => {
                if (!on || (await ensurePermission())) setNotifications({ ...notif, progress: on });
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Stałe, ciche powiadomienie z paskiem postępu wykonanych dziś zadań i planem, jak skończyć dzień (Android).
          </p>
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
              <span className="font-medium">Szpila - złośliwy towarzysz</span>
            </div>
            <Toggle
              checked={notif.taunts}
              disabled={permission === "unsupported"}
              onChange={async (on) => {
                if (!on || (await ensurePermission())) setNotifications({ ...notif, taunts: on });
              }}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Wbija szpile w ciągu dnia ({tauntWindow(notif.quietTo, notif.quietFrom)}), gdy zadania leżą albo nie potwierdzisz zakazanych. Teksty są
            dopasowane do konkretnego zadania.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {(
              [
                ["hard", "Wulgarny 🤬"],
                ["soft", "Łagodny 🙂"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setNotifications({ ...notif, tauntLevel: v })}
                className="rounded-full py-2 text-xs font-semibold"
                style={{
                  backgroundColor: notif.tauntLevel === v ? "var(--avoid)" : "var(--background)",
                  color: notif.tauntLevel === v ? "var(--primary-foreground)" : "var(--foreground)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Szpil dziennie</span>
            <div className="flex gap-1.5">
              {[3, 5, 8].map((n) => (
                <button
                  key={n}
                  onClick={() => setNotifications({ ...notif, tauntsPerDay: n })}
                  disabled={!notif.taunts}
                  className="h-8 w-10 rounded-full text-xs font-semibold disabled:opacity-40"
                  style={{
                    backgroundColor: notif.tauntsPerDay === n ? "var(--avoid)" : "var(--background)",
                    color: notif.tauntsPerDay === n ? "var(--primary-foreground)" : "var(--foreground)",
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
            <span className="font-medium">Tryb snu</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-muted-foreground">Cisza od - do</span>
            <div className="flex items-center gap-2">
              <TimeInput value={notif.quietFrom} onChange={(v) => setNotifications({ ...notif, quietFrom: v })} />
              <span className="text-muted-foreground">-</span>
              <TimeInput value={notif.quietTo} onChange={(v) => setNotifications({ ...notif, quietTo: v })} />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            W tych godzinach Szpila milczy, a szpile rozkładają się równo między pobudką a snem. Wyjątek: przyłapanie
            na telefonie po nocy.
          </p>
        </div>

        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ClipboardCheck size={18} className="text-primary" />
              <span className="font-medium">Wieczorne rozliczenie</span>
            </div>
            <Toggle
              checked={notif.review}
              disabled={permission === "unsupported"}
              onChange={async (on) => {
                if (!on || (await ensurePermission())) setNotifications({ ...notif, review: on });
              }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Godzina</span>
            <TimeInput
              value={notif.reviewAt}
              disabled={!notif.review}
              onChange={(v) => setNotifications({ ...notif, reviewAt: v })}
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Jedno powiadomienie z przyciskami „Wszystko czysto” / „Wpadka” dla wszystkich niepotwierdzonych zakazanych.
          </p>
        </div>

        <SensorsCard onMessage={setMsg} />

        <Row
          icon={<Smartphone size={18} />}
          title="Widżety na ekranie głównym"
          desc="Przytrzymaj pusty obszar ekranu głównego → Widżety → Loop. Są trzy: lista, ikony z pierścieniem postępu i mały 1×1 „Następne zadanie”, który sam wybiera, co robić teraz."
        />
        <div className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck size={18} className="text-primary" />
              <span className="font-medium">Automatyczna kopia codziennie</span>
            </div>
            <Toggle checked={autoBackup} onChange={setAutoBackup} />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Raz dziennie zapisuje kopię do Pobrane/Loop (po jednym pliku na dzień tygodnia, więc masz ostatnie 7
            dni). Po reinstalacji przywrócisz ją przyciskiem „Przywróć z pliku”.
            {lastAuto && ` Ostatnia: ${lastAuto}.`}
          </p>
        </div>
        <Action icon={<Download size={18} />} label="Zapisz kopię teraz" onClick={() => void doExport(false)} />
        <Action icon={<Share2 size={18} />} label="Udostępnij kopię (Dysk, mail…)" onClick={() => void doExport(true)} />
        <Action
          icon={<Upload size={18} />}
          label="Przywróć z pliku"
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
          label="Usuń wszystkie dane"
          onClick={() => {
            if (confirm("Usunąć wszystkie zadania i historię? Tego nie da się cofnąć.")) {
              reset();
              setMsg("Wyczyszczono.");
            }
          }}
          danger
        />
        {msg && <p className="pt-2 text-center text-xs text-muted-foreground">{msg}</p>}

        <p className="pt-10 text-center text-xs text-muted-foreground">
          Loop · nawyki offline, bez konta
        </p>
      </div>
    </AppShell>
  );
}

function Row({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="flex gap-3 rounded-2xl bg-card p-4">
      <div className="mt-0.5 text-primary">{icon}</div>
      <div>
        <div className="font-medium">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
      </div>
    </div>
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
      <div className="font-medium">Automatyczne śledzenie</div>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Włącz źródło tutaj, a potem wybierz je w edycji zadania („Kroki z Health Connect” albo „Oceniaj z czasu
        ekranu”).
      </p>

      <div className="mt-3 flex items-center gap-3">
        <Footprints size={18} className="shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Kroki z Health Connect</div>
          <div className="text-[11px] text-muted-foreground">
            {steps == null
              ? "Sprawdzam…"
              : !steps.available
              ? "Health Connect niedostępny na tym urządzeniu."
              : steps.granted
              ? `Połączono${steps.background ? "" : " (bez odczytu w tle - widżet odświeży się po otwarciu aplikacji)"} · zadania: ${stepHabits}`
              : "Brak zgody na odczyt kroków."}
          </div>
        </div>
        {steps?.available && !steps.granted && (
          <button
            onClick={async () => {
              const s = await requestSteps();
              setSteps(s);
              if (s.granted) {
                await syncSensors();
                onMessage("Połączono z Health Connect.");
              }
            }}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            Połącz
          </button>
        )}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <PhoneOff size={18} className="shrink-0" style={{ color: "var(--avoid)" }} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Czas ekranu w nocy</div>
          <div className="text-[11px] text-muted-foreground">
            {screen == null
              ? "Sprawdzam…"
              : screen
              ? `Dostęp przyznany · zadania: ${screenHabits}`
              : "Wymaga „dostępu do danych o użyciu” w ustawieniach systemu."}
          </div>
        </div>
        {screen === false && (
          <button
            onClick={() => void openUsageSettings()}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
            style={{ backgroundColor: "var(--avoid)", color: "var(--primary-foreground)" }}
          >
            Otwórz
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
