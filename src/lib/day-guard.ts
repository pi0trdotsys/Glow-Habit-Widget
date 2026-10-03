// The guard outside the night (native side: DayGuard.java + LiveGuardService):
// - "najpierw zadania, potem Instagram": in the morning social media stays
//   blocked until the morning habits are ticked off (one unit is enough - the
//   morning brush, the first glass of water);
// - the daily social media limit: past it, Szpila jabs and blocks like at night.
// Lines are mirrored into the widget snapshot (live.lines). Placeholders:
// {tasks} pending morning habits, {app}, {used} / {limit} / {over} / {left}
// minutes, {m} minutes in the app, {time}, {u} your name.
import type { Habit } from "@/lib/habits/types";
import type { NotificationSettings, TauntLevel } from "@/lib/habits/store";
import { categoryOf } from "@/lib/habits/szpila";
import { goalOf, isDueOn, kindOf, amountOn, todayKey } from "@/lib/habits/utils";
import type { Completion } from "@/lib/habits/types";
import { L, pick } from "@/lib/i18n";
import { bankState } from "@/lib/bank";

type Key = "morning" | "morningDone" | "dayOver" | "dayEscalate" | "dayWarn" | "dayBlock";

const HARD: Record<Key, string[]> = {
  morning: [
    "Najpierw {tasks}. Potem {app}. Taka jest umowa, a ja jej pilnuję.",
    "{app} przed {tasks}? Nie ze mną. Ogarnij się, dosłownie.",
    "Rano najpierw ty, potem algorytm. Zostało: {tasks}.",
    "Chcesz scrollować? Zarób na to: {tasks}. Dwie minuty i {app} jest twój.",
    "Kurwa, jeszcze nawet {tasks} nie zrobione, a ty już w {app}. Odłóż to.",
    "Najpierw {tasks}, potem {app}. Zęby i woda nie zajmą dłużej niż jedna rolka, kurwa.",
    "{app} o poranku przed {tasks}? Algorytm poczeka, twoje zęby nie.",
    "Dzień dobry. {tasks} i dopiero wtedy {app}. Taka jest kolejność, a ja tu rządzę.",
  ],
  morningDone: [
    "Zrobione. Social media odblokowane. Tylko bez przesady, wiem, gdzie mieszkasz.",
    "Poranek ogarnięty. Możesz scrollować - z czystym sumieniem, na razie.",
    "No proszę, najpierw obowiązki, potem przyjemności. Kot zadowolony.",
    "Poranek zaliczony. Social media odblokowane, ale nie przesadzaj, bo wrócę.",
    "Brawo, najpierw obowiązki. Teraz możesz scrollować. Nie mów, że kot jest bez serca.",
  ],
  dayOver: [
    "Limit {limit} min przekroczony: dziś już {used} min social mediów. Zamykaj {app}.",
    "{used} min scrollowania dziś. Limit był {limit}. Co ty robisz ze swoim życiem?",
    "Dzienny limit poszedł się jebać: {used}/{limit} min. {app} na dziś wystarczy.",
    "Przekroczone o {over} min. Każda kolejna minuta na {app} to minuta ukradziona z twojego dnia.",
    "{used} min social mediów dziś. Limit {limit}. Pół dnia oddane obcym ludziom, kurwa.",
    "Limit przekroczony o {over} min. {app} wysysa ci dzień jak odkurzacz.",
  ],
  dayEscalate: [
    "Wciąż {app}. {used} min dziś, limit {limit}. Serio, odłóż to.",
    "Już {over} min ponad limit. Kciuk ci odpadnie, a mózg zgnije. Zamykaj.",
    "{m} min w {app} od ostatniej szpili. Nie żartuję, kończ.",
    "Wciąż {app}, już {over} min ponad limit. Odłóż to gówno i zrób coś prawdziwego.",
    "{m} min od ostatniej szpili i dalej {app}. Serio, kurwa?",
  ],
  dayWarn: [
    "Zostało {left} min social mediów na dziś. Wydaj je mądrze albo wcale.",
    "Uwaga: {left} min do limitu. Potem zaczynam szpilować.",
    "Jeszcze {left} min social mediów. Potem zaczyna się jazda bez trzymanki.",
  ],
  dayBlock: [
    "Dość. {used} min social mediów dziś przy limicie {limit}. {app} ma fajrant.",
    "Trzy szpile zignorowane, limit przekroczony o {over} min. Teraz ja zamykam {app}.",
    "Na dziś koniec. Jutro nowy limit, dziś idź zrób coś prawdziwego.",
    "Limit {limit} min na dziś zjedzony. {app} zamknięte, a ty idź na spacer, kurwa.",
    "Koniec social mediów na dziś: {used} min. Zrób coś, czego nie da się zescrollować.",
  ],
};

const SOFT: Record<Key, string[]> = {
  morning: [
    "Najpierw {tasks}, potem {app}. To tylko chwila!",
    "Najpierw {tasks}, potem {app}. Dobry start dnia!",
  ],
  morningDone: ["Poranek ogarnięty - social media odblokowane. Miłego dnia!"],
  dayOver: ["Dzisiejszy limit {limit} min social mediów minął ({used} min). Może przerwa?"],
  dayEscalate: ["Już {over} min ponad limit. Pora odłożyć telefon."],
  dayWarn: [
    "Zostało {left} min social mediów na dziś.",
    "Zostało {left} min. Wykorzystaj je mądrze.",
  ],
  dayBlock: [
    "Limit na dziś wykorzystany ({used}/{limit} min). Wróć jutro!",
    "Limit na dziś wykorzystany. Pora na coś offline!",
  ],
};

const HARD_EN: Record<Key, string[]> = {
  morning: [
    "First {tasks}. Then {app}. That's the deal, and I'm enforcing it.",
    "{app} before {tasks}? Not on my watch. Get your shit together, literally.",
    "Mornings: you first, the algorithm second. Still left: {tasks}.",
    "Want to scroll? Earn it: {tasks}. Two minutes and {app} is yours.",
    "For fuck's sake, {tasks} isn't even done and you're already on {app}. Put it down.",
    "First {tasks}, then {app}. Teeth and water take less time than one reel, damn it.",
    "{app} in the morning before {tasks}? The algorithm can wait, your teeth can't.",
    "Good morning. {tasks} and only then {app}. That's the order, and I'm in charge here.",
  ],
  morningDone: [
    "Done. Social media unlocked. Don't overdo it, I know where you live.",
    "Morning sorted. Scroll away - with a clear conscience, for now.",
    "Look at that: duties first, fun second. The cat approves.",
    "Morning done. Social media unlocked, but don't overdo it or I'll be back.",
    "Bravo, duties first. Now you can scroll. Don't say the cat has no heart.",
  ],
  dayOver: [
    "Limit of {limit} min blown: {used} min of social media today. Close {app}.",
    "{used} min of scrolling today. The limit was {limit}. What are you doing with your life?",
    "The daily limit just got fucked: {used}/{limit} min. That's enough {app} for today.",
    "{over} min over. Every extra minute on {app} goes on my list of grievances.",
    "{used} min of social media today. Limit {limit}. Half a day handed to strangers, damn it.",
    "{over} min over the limit. {app} is sucking up your day like a vacuum cleaner.",
  ],
  dayEscalate: [
    "Still on {app}. {used} min today, limit {limit}. Seriously, put it down.",
    "{over} min over the limit already. Your thumb will fall off and your brain will rot. Close it.",
    "{m} min on {app} since my last jab. I'm not joking - wrap it up.",
    "Still on {app}, {over} min over the limit. Put that shit down and do something real.",
    "{m} min since my last jab and still {app}. Seriously, damn it?",
  ],
  dayWarn: [
    "{left} min of social media left today. Spend them wisely - or not at all.",
    "Heads up: {left} min to the limit. Then the jabbing starts.",
    "{left} min of social media left. Then the gloves come off.",
  ],
  dayBlock: [
    "Enough. {used} min of social media today on a {limit} min limit. {app} is off duty.",
    "Three jabs ignored, {over} min over the limit. Now I'm closing {app}.",
    "That's it for today. New limit tomorrow - today, go do something real.",
    "Today's {limit} min limit is eaten. {app} is closed, and you go for a walk, damn it.",
    "Social media's done for today: {used} min. Go do something you can't scroll.",
  ],
};

const SOFT_EN: Record<Key, string[]> = {
  morning: [
    "First {tasks}, then {app}. It only takes a moment!",
    "First {tasks}, then {app}. A good start to the day!",
  ],
  morningDone: ["Morning sorted - social media unlocked. Have a great day!"],
  dayOver: ["Today's {limit} min social media limit is up ({used} min). Maybe take a break?"],
  dayEscalate: ["{over} min over the limit. Time to put the phone down."],
  dayWarn: ["{left} min of social media left today.", "{left} min left. Use them wisely."],
  dayBlock: [
    "Today's limit is used up ({used}/{limit} min). See you tomorrow!",
    "Today's limit is used up. Time for something offline!",
  ],
};

// "Bank minut" (src/lib/bank.ts): the same moments in bank mode. Extra
// placeholders: {bank} minutes left in the bank, {earn} minutes per habit;
// {limit} = what the bank got today.
type BankKey = "bankOver" | "bankEscalate" | "bankWarn" | "bankBlock";

const BANK_HARD: Record<BankKey, string[]> = {
  bankOver: [
    "Bank pusty. Chcesz {app}? Zarób go: +{earn} min za każde zadanie.",
    "Zero minut w banku, a ty w {app}. Najpierw robota, potem scrollowanie, kurwa.",
    "Wydane {used} z {limit} min. Bank świeci pustkami. Zrób zadanie, to pogadamy.",
    "Konto social mediów: 0 min. Debetu nie ma. Zamykaj {app}.",
    "Za darmo w {app} są tylko reklamy. Minuty się zarabia: +{earn} za zadanie.",
  ],
  bankEscalate: [
    "Dalej {app}, a bank dalej pusty. {over} min na kredyt. Zamykaj.",
    "{m} min od ostatniej szpili, zero minut w banku. Idź zrób coś, za co dostaniesz minuty.",
    "Już {over} min na debecie. Ten bank nie udziela kredytów, kurwa.",
  ],
  bankWarn: [
    "W banku zostało {bank} min. Zrób zadanie, to dorzucę {earn}.",
    "Uwaga: {bank} min w banku. Potem zaczynam szpilować, chyba że coś zarobisz.",
  ],
  bankBlock: [
    "Bank pusty, trzy szpile zignorowane. {app} zamknięte. Chcesz więcej? Zarób: +{earn} min za zadanie.",
    "Wydane {used} z {limit} min. Na kredyt się nie scrolluje. Idź coś zrobić, kurwa.",
    "Koniec kasy. {app} zamknięte, dopóki czegoś nie odhaczysz.",
  ],
};

const BANK_SOFT: Record<BankKey, string[]> = {
  bankOver: ["Bank minut pusty ({used}/{limit} min). Zrób zadanie, a dostaniesz +{earn} min."],
  bankEscalate: ["Już {over} min ponad bank. Może najpierw jakieś zadanie?"],
  bankWarn: ["W banku zostało {bank} min. Każde zadanie to +{earn} min."],
  bankBlock: ["Bank na dziś wyczerpany. Zrób zadanie, żeby zarobić +{earn} min."],
};

const BANK_HARD_EN: Record<BankKey, string[]> = {
  bankOver: [
    "The bank's empty. Want {app}? Earn it: +{earn} min per habit.",
    "Zero minutes in the bank and you're on {app}. Work first, scroll later, damn it.",
    "Spent {used} of {limit} min. The bank is bone dry. Do a habit, then we'll talk.",
    "Social media account: 0 min. No overdraft here. Close {app}.",
    "The only free thing on {app} is the ads. Minutes are earned: +{earn} per habit.",
  ],
  bankEscalate: [
    "Still {app}, still an empty bank. {over} min on credit. Close it.",
    "{m} min since my last jab, zero in the bank. Go do something that earns minutes.",
    "{over} min into the overdraft. This bank doesn't do loans, for fuck's sake.",
  ],
  bankWarn: [
    "{bank} min left in the bank. Do a habit and I'll add {earn}.",
    "Heads up: {bank} min in the bank. Then the jabbing starts, unless you earn some.",
  ],
  bankBlock: [
    "The bank's empty, three jabs ignored. {app} is closed. Want more? Earn it: +{earn} min per habit.",
    "Spent {used} of {limit} min. No scrolling on credit. Go do something, damn it.",
    "Out of minutes. {app} stays closed until you tick something off.",
  ],
};

const BANK_SOFT_EN: Record<BankKey, string[]> = {
  bankOver: ["Your minute bank is empty ({used}/{limit} min). Do a habit to earn +{earn} min."],
  bankEscalate: ["{over} min past the bank. Maybe a habit first?"],
  bankWarn: ["{bank} min left in the bank. Every habit adds +{earn} min."],
  bankBlock: ["Today's bank is used up. Do a habit to earn +{earn} min."],
};

export function dayLines(
  level: TauntLevel,
  userName: string | null,
): Record<Key | BankKey, string[]> {
  const base =
    level === "soft"
      ? { ...pick(SOFT, SOFT_EN), ...pick(BANK_SOFT, BANK_SOFT_EN) }
      : { ...pick(HARD, HARD_EN), ...pick(BANK_HARD, BANK_HARD_EN) };
  const u = (l: string) => l.replaceAll("{u}", userName || L("ty", "you"));
  const out = {} as Record<Key | BankKey, string[]>;
  for (const k of Object.keys(base) as (Key | BankKey)[]) out[k] = base[k].map(u);
  return out;
}

/** Morning habits by default: brushing teeth and drinking water (habits to do, due today). */
export function autoMorningHabits(habits: Habit[], today: Date = new Date()): string[] {
  return habits
    .filter((h) => kindOf(h) === "build" && isDueOn(h, today))
    .filter((h) => ["teeth", "water"].includes(categoryOf(h)))
    .map((h) => h.id);
}

/** The chosen morning habits (null = automatic), limited to existing habits to do. */
export function morningHabitIds(
  n: NotificationSettings,
  habits: Habit[],
  today: Date = new Date(),
): string[] {
  if (n.morningHabits == null) return autoMorningHabits(habits, today);
  const ok = new Set(habits.filter((h) => kindOf(h) === "build").map((h) => h.id));
  return n.morningHabits.filter((id) => ok.has(id));
}

/** Mirrors DayGuard.morningDone: one unit logged is enough in the morning. */
export function morningDone(h: Habit, completions: Completion[], day: Date = new Date()): boolean {
  const g = goalOf(h);
  const need = Math.max(1, Math.min(g.step ?? 1, g.target));
  return amountOn(h, completions, day) >= need;
}

/** Morning habits still pending today (for the Today banner). */
export function morningPending(
  n: NotificationSettings,
  habits: Habit[],
  completions: Completion[],
  now: Date = new Date(),
): Habit[] {
  const ids = morningHabitIds(n, habits, now);
  return ids
    .map((id) => habits.find((h) => h.id === id)!)
    .filter((h) => h && !morningDone(h, completions, now));
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Is the morning lock active at this minute (05:00 .. until)? Mirrors DayGuard.phase. */
export function morningWindow(n: NotificationSettings, nowMin: number): boolean {
  return n.morningLock && nowMin >= 5 * 60 && nowMin < toMin(n.morningUntil);
}

/** The `morning` / `day` parts of the snapshot's `live` object (DayGuard.java). */
export function dayGuardState(n: NotificationSettings, habits: Habit[], today: Date = new Date()) {
  return {
    morning: {
      enabled: n.morningLock,
      until: toMin(n.morningUntil),
      habits: morningHabitIds(n, habits, today),
    },
    // debt: last night comes off today's limit (DayGuard.debt); mode + bank: "Bank minut"
    // (DayGuard.bankMode / bankRules) - the limit is earned natively from the rows.
    day: {
      enabled: n.dailyLimit,
      limit: n.dailyLimitMin,
      debt: n.nightDebt ?? true,
      ...bankState(n),
    },
  };
}

// ---------------------------------------------------------------- stats

export type LimitDay = { key: string; minutes: number | null; over: boolean; limit?: number };

/**
 * Social media minutes per day (last `days`, oldest first) against the limit.
 * With `limits` (bank mode: the day's actual balance, from the native guard)
 * each day is judged against its own limit; days without one use `limit`.
 */
export function limitSeries(
  daySocial: Record<string, number>,
  limit: number,
  days = 14,
  now: Date = new Date(),
  limits?: Record<string, number>,
): LimitDay[] {
  const out: LimitDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = todayKey(d);
    const minutes = daySocial[key] ?? null;
    if (limits) {
      const l = limits[key] ?? limit;
      out.push({ key, minutes, over: minutes != null && minutes > l, limit: l });
    } else out.push({ key, minutes, over: minutes != null && minutes > limit });
  }
  return out;
}

/** Days within the limit / days with data, among the given series. */
export function limitScore(series: LimitDay[]): { within: number; tracked: number } {
  const tracked = series.filter((d) => d.minutes != null);
  return { within: tracked.filter((d) => !d.over).length, tracked: tracked.length };
}
