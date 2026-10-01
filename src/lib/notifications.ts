// Notifications engine. On the native Android app it uses
// @capacitor/local-notifications (real scheduled OS notifications that fire even
// when the app is closed). On the web it falls back to the Notification API with
// a lightweight in-page scheduler that only fires while a tab is open.
//
// Reminders scheduled here:
//   - a daily check-in                 (notifications.enabled / .time)
//   - per-habit reminders              (habit.reminder, "HH:mm")
//   - a weekly recap nudge             (notifications.weeklyReport / .reportDay / .reportTime)
//   - week-vs-week boosts              (notifications.boosts)
//
// The progress-bar notification and Szpila's jabs are native on Android
// (HabitNotifier.java reads the widget snapshot at fire time, so they're never
// stale). On the web, jabs fire from the in-page scheduler below.
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import type { LocalNotificationSchema } from "@capacitor/local-notifications";
import { useHabits } from "@/lib/habits/store";
import { formatMinute, kindOf, planDay, weeklyReport } from "@/lib/habits/utils";
import { SZPILA_EMOJI, SZPILA_NAME, szpilaNow } from "@/lib/habits/szpila";
import { boostSet } from "@/lib/habits/chain";
import { focusHabit } from "@/lib/habits/focus";
import { isEn, L } from "@/lib/i18n";

export type PermissionState = "granted" | "denied" | "default" | "unsupported";

// Reserved notification IDs. Per-habit ids are derived from the habit id and
// live above HABIT_ID_BASE so they never collide with the fixed ones.
// 7001-7999 are used natively by HabitNotifier.java.
const ID_DAILY = 1001;
const ID_WEEKLY = 2001;
const ID_BOOST_1 = 3001;
const ID_BOOST_2 = 3002;
const HABIT_ID_BASE = 100000;

// Times of day for the motivational boosts (local).
const BOOST_TIMES = [
  { hour: 12, minute: 30 },
  { hour: 17, minute: 30 },
];

/**
 * Minutes of day for Szpila's jabs, spread evenly from wake+30 to
 * bedtime-30 (the window may cross midnight). Defaults 9:00/22:00 give
 * 9:30-21:30. Mirrored in HabitNotifier.tauntSlots (Java).
 */
export function tauntSlots(n: number, wake = 9 * 60, bedtime = 22 * 60): number[] {
  const start = wake + 30;
  let end = (bedtime > wake ? bedtime : bedtime + 24 * 60) - 30;
  if (end < start) end = start;
  if (n <= 1) return [start % 1440];
  return Array.from(
    { length: n },
    (_, i) => Math.round(start + ((end - start) * i) / (n - 1)) % 1440,
  );
}

const hhmmToMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

const isNative = () => Capacitor.isNativePlatform();

export function notificationsSupported(): boolean {
  if (isNative()) return true;
  return typeof window !== "undefined" && "Notification" in window;
}

function habitNotifId(habitId: string): number {
  let h = 0;
  for (let i = 0; i < habitId.length; i++) h = (h * 31 + habitId.charCodeAt(i)) | 0;
  return HABIT_ID_BASE + (Math.abs(h) % 800000);
}

function parseTime(t: string | null | undefined): { hour: number; minute: number } {
  const [h, m] = (t || "20:00").split(":").map(Number);
  return { hour: Number.isFinite(h) ? h : 20, minute: Number.isFinite(m) ? m : 0 };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Notification titles and the daily check-in text (evaluated at call time - the language can change). */
const T = {
  daily: () => L("Pora sprawdzić dzisiejsze zadania.", "Time to check today's habits."),
  reminder: () => L("Przypomnienie", "Reminder"),
  weekly: () => L("Podsumowanie tygodnia", "Weekly recap"),
  boost: () => L("Tydzień do tygodnia", "Week vs week"),
};

/** "Piotr, " prefix, or nothing without a name. */
const whoPrefix = (userName: string | null | undefined) => (userName ? `${userName}, ` : "");

/** Capitalise the first letter when there is no name in front. */
const cap = (who: string, s: string) => (who ? s : s.charAt(0).toUpperCase() + s.slice(1));

/** Weekly-recap body comparing this week to last week over the same window. */
function weeklyReportBody(): string {
  const { habits, completions, userName } = useHabits.getState();
  const who = whoPrefix(userName);
  if (habits.length === 0) {
    return isEn()
      ? `${who}${cap(who, "open Szpila and add some habits to start the week strong.")}`
      : `${who}otwórz Szpilę i dodaj zadania, żeby zacząć tydzień z przytupem.`;
  }
  const r = weeklyReport(habits, completions);
  const d = r.delta;
  if (isEn()) {
    const trend =
      d > 0
        ? `you're ${d} pts ahead of last week - keep it up!`
        : d === 0
          ? "you're neck and neck with last week - can you pull ahead?"
          : `last week was ${Math.abs(d)} pts better - time to catch up!`;
    return `${who}${cap(who, trend)} Tap to see the report.`;
  }
  const trend =
    d > 0
      ? `jesteś ${d} pkt przed zeszłym tygodniem - tak trzymaj!`
      : d === 0
        ? "idziesz łeb w łeb z zeszłym tygodniem - dasz radę wyprzedzić?"
        : `zeszły tydzień był lepszy o ${Math.abs(d)} pkt - czas to odrobić!`;
  return `${who}${trend} Dotknij, żeby zobaczyć raport.`;
}

/**
 * Midday boost that compares this week to last week (same window).
 * `slot` picks a different angle so the two daily boosts don't read the same.
 */
function boostBody(slot: number): string {
  const { habits, completions, userName } = useHabits.getState();
  const who = whoPrefix(userName);
  if (habits.length === 0) {
    return isEn()
      ? `${who}${cap(who, "add a habit and start building a streak today. 🌱")}`
      : `${who}dodaj zadanie i zacznij budować serię już dziś. 🌱`;
  }
  const r = weeklyReport(habits, completions);
  const d = r.delta;

  if (isEn()) {
    const upDown = d > 0 ? `+${d} pts 🚀` : d < 0 ? `${d} pts` : "a tie";
    if (slot === 0) {
      return `${who}${cap(who, `this week ${r.thisWeek.rate}%, last week by now ${r.lastWeek.rate}% (${upDown}).`)} ${
        d >= 0 ? "Keep going! 🔥" : "A few taps and you'll catch up 💪"
      }`;
    }
    const diff = Math.round(r.thisWeek.score - r.lastWeek.score);
    const countLine =
      diff > 0
        ? `${diff} more than a week ago by now 🎉`
        : diff < 0
          ? `${Math.abs(diff)} fewer than a week ago by now - catch up! 💪`
          : "exactly as many as a week ago by now";
    const done = Math.round(r.thisWeek.score);
    return `${who}${cap(who, `${done} done this week, ${countLine}`)}`;
  }

  const upDown = d > 0 ? `+${d} pkt 🚀` : d < 0 ? `${d} pkt` : "remis";
  if (slot === 0) {
    return `${who}ten tydzień ${r.thisWeek.rate}%, zeszły o tej porze ${r.lastWeek.rate}% (${upDown}). ${
      d >= 0 ? "Jedziesz dalej! 🔥" : "Kilka kliknięć i odrobisz 💪"
    }`;
  }
  const diff = Math.round(r.thisWeek.score - r.lastWeek.score);
  const countLine =
    diff > 0
      ? `o ${diff} więcej niż tydzień temu o tej porze 🎉`
      : diff < 0
        ? `o ${Math.abs(diff)} mniej niż tydzień temu o tej porze - nadrób! 💪`
        : "dokładnie tyle, co tydzień temu o tej porze";
  return `${who}w tym tygodniu ${Math.round(r.thisWeek.score)} wykonań, ${countLine}`;
}

function reminderBody(habitId: string, name: string): string {
  const h = useHabits.getState().habits.find((x) => x.id === habitId);
  if (isEn())
    return h && kindOf(h) === "avoid" ? `Confirm a day without: ${name}` : `Time for: ${name}`;
  return h && kindOf(h) === "avoid" ? `Potwierdź, że dziś bez: ${name}` : `Pora na: ${name}`;
}

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (isNative()) {
    const res = await LocalNotifications.requestPermissions();
    return res.display === "granted" ? "granted" : "denied";
  }
  if (!notificationsSupported()) return "unsupported";
  const p = await Notification.requestPermission();
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "default";
}

export async function getPermissionState(): Promise<PermissionState> {
  if (isNative()) {
    const res = await LocalNotifications.checkPermissions();
    return res.display === "granted" ? "granted" : res.display === "denied" ? "denied" : "default";
  }
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission as PermissionState;
}

// ---------------------------------------------------------------------------
// Native scheduling
// ---------------------------------------------------------------------------

async function cancelAllNative(): Promise<void> {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }
}

async function syncNative(): Promise<void> {
  const perm = await LocalNotifications.checkPermissions();
  await cancelAllNative();
  if (perm.display !== "granted") return;

  const { habits, notifications } = useHabits.getState();
  const schedule: LocalNotificationSchema[] = [];

  if (notifications.enabled) {
    const { hour, minute } = parseTime(notifications.time);
    schedule.push({
      id: ID_DAILY,
      title: "Szpila",
      body: T.daily(),
      schedule: { on: { hour, minute } },
    });
  }

  for (const h of habits) {
    if (!h.reminder) continue;
    const { hour, minute } = parseTime(h.reminder);
    schedule.push({
      id: habitNotifId(h.id),
      title: T.reminder(),
      body: reminderBody(h.id, h.name),
      schedule: { on: { hour, minute } },
      extra: { habitId: h.id },
    });
  }

  if (notifications.weeklyReport) {
    const { hour, minute } = parseTime(notifications.reportTime);
    // Capacitor weekday is 1=Sunday .. 7=Saturday; our reportDay is 0=Sunday.
    const weekday = (((notifications.reportDay % 7) + 7) % 7) + 1;
    schedule.push({
      id: ID_WEEKLY,
      title: T.weekly(),
      body: weeklyReportBody(),
      schedule: { on: { weekday, hour, minute } },
      extra: { route: "/report" },
    });
  }

  if (notifications.boosts) {
    const boostIds = [ID_BOOST_1, ID_BOOST_2];
    BOOST_TIMES.forEach((t, i) => {
      schedule.push({
        id: boostIds[i],
        title: T.boost(),
        body: boostBody(i),
        schedule: { on: { hour: t.hour, minute: t.minute } },
        extra: { route: "/report" },
      });
    });
  }

  if (schedule.length) {
    await LocalNotifications.schedule({ notifications: schedule });
  }
}

// ---------------------------------------------------------------------------
// Web fallback (in-page minute scheduler; only fires while a tab is open)
// ---------------------------------------------------------------------------

let webTimer: ReturnType<typeof setInterval> | null = null;
let firedDate = "";
const firedKeys = new Set<string>();

function webTick(): void {
  if (Notification.permission !== "granted") return;
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  if (dateKey !== firedDate) {
    firedDate = dateKey;
    firedKeys.clear();
  }
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const { habits, completions, notifications, userName } = useHabits.getState();

  const fire = (key: string, title: string, body: string) => {
    if (firedKeys.has(key)) return;
    firedKeys.add(key);
    try {
      new Notification(title, { body, icon: "/icon-192.png", tag: key });
    } catch {
      /* ignore */
    }
  };

  if (notifications.enabled && notifications.time === hhmm) {
    fire("daily", "Szpila", T.daily());
  }
  for (const h of habits) {
    if (h.reminder && h.reminder === hhmm) {
      fire(`habit-${h.id}`, T.reminder(), reminderBody(h.id, h.name));
    }
  }
  if (
    notifications.weeklyReport &&
    notifications.reportTime === hhmm &&
    now.getDay() === notifications.reportDay
  ) {
    fire("weekly", T.weekly(), weeklyReportBody());
  }
  if (notifications.boosts) {
    BOOST_TIMES.forEach((t, i) => {
      if (`${pad(t.hour)}:${pad(t.minute)}` === hhmm) {
        fire(`boost-${i}`, T.boost(), boostBody(i));
      }
    });
  }
  if (notifications.taunts) {
    const slots = tauntSlots(
      notifications.tauntsPerDay,
      hhmmToMin(notifications.quietTo),
      hhmmToMin(notifications.quietFrom),
    );
    for (const m of slots) {
      if (formatMinute(m) !== hhmm) continue;
      const { focus } = useHabits.getState();
      const plan = planDay(habits, completions, now, boostSet(habits, completions, focus, now));
      if (plan.length === 0) continue;
      const say = szpilaNow(
        habits,
        completions,
        plan,
        notifications.tauntLevel,
        userName,
        m,
        focusHabit(habits, focus, now)?.id,
      );
      fire(
        `taunt-${m}`,
        `${say.mood === "angry" ? SZPILA_EMOJI.angry : SZPILA_EMOJI.normal} ${SZPILA_NAME}`,
        say.text,
      );
    }
  }
}

function syncWeb(): void {
  if (!notificationsSupported()) return;
  if (webTimer) {
    clearInterval(webTimer);
    webTimer = null;
  }
  if (Notification.permission !== "granted") return;
  webTimer = setInterval(webTick, 30000);
  webTick();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Reschedule every reminder from the current store state. Safe to call often. */
export async function syncNotifications(): Promise<void> {
  try {
    if (isNative()) await syncNative();
    else syncWeb();
  } catch {
    /* scheduling failures shouldn't crash the app */
  }
}
