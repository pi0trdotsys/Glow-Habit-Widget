// "Rachunek za noc": what last night really looked like (social media per app
// after midnight, screen minutes, when the phone went down) + Szpila's comment.
// Numbers come from the native side (NightStats.report); the lines are mirrored
// in the widget snapshot ("bill") for the morning notification.
// Placeholders: {social} social minutes, {screen} screen minutes, {visits},
// {asleep} time the phone went down, {apps} "3× Instagram (22 min) · ...",
// {sleep} sleep from the band ("6 h 12 min"), {fell} minutes from putting the
// phone down to falling asleep.
// Pools: bad (social media after midnight) / good (clean), and with sleep from
// the band short (< 6 h) / rested (7 h+) - see billPools.
import { addDays } from "date-fns";
import type { TauntLevel } from "@/lib/habits/store";
import type { NightReport } from "@/lib/sensors";
import { formatMinute, todayKey } from "@/lib/habits/utils";
import { L, pick } from "@/lib/i18n";

export type BillPool = "bad" | "good" | "short" | "rested";
type BillLines = Record<BillPool, string[]>;

const BILL: Record<TauntLevel, BillLines> = {
  hard: {
    bad: [
      "{social} minut social mediów po północy. Tyle kosztował cię sen. Warto było? Nie było.",
      "Powrotów do tego gówna w nocy: {visits}. Dziś wieczorem telefon ląduje poza łóżkiem.",
      "Telefon odłożony o {asleep}. A potem się dziwisz, że rano jesteś zombie.",
      "{apps}. Algorytmy się najadły, a twój sen poszedł się jebać. Brawo.",
      "Nocny rachunek: {social} min scrollowania. Zapłacisz dziś koncentracją i humorem.",
      "Tyle scrollowania po północy, a nic z tego nie pamiętasz. Dziś odkładasz to przed 24:00.",
      "{social} min social mediów po północy. Sen poszedł się jebać, a ty nawet nie pamiętasz po co.",
      "Nocne wejścia w social media: {visits}. Dziś telefon śpi w kuchni, kurwa.",
      "{screen} min ekranu w nocy. Oczy wyglądają dziś jak dwie dziury w śniegu.",
      "Rachunek za noc: {apps}. Zapłacone snem, gotówki nie przyjmujemy.",
    ],
    good: [
      "Zero social mediów po północy. Nie wierzę, ale szanuję. Powtórz to dziś.",
      "Czysta noc. Algorytm płakał, a łóżko wreszcie służyło do spania. Tak ma być.",
      "Telefon odłożony o {asleep} i żadnego scrollowania. Kot jest dumny. Trochę.",
      "Noc bez TikToków i Instagramów. Może jednak coś z ciebie będzie.",
      "Czysta noc. Telefon spał osobno, łóżko służyło do spania. Kurwa, tak trzymaj.",
      "Zero scrollowania po północy. Algorytm głodny, a sen wygrany. Szanuję.",
      "Telefon odłożony o {asleep}. Rano widać to na twarzy. Dobra robota.",
    ],
    short: [
      "{sleep} snu. Tyle to kot śpi między jednym żarciem a drugim, a nie dorosły człowiek.",
      "Sen: {sleep}. Mózg jedzie dziś na oparach, więc żadnych ważnych decyzji, kurwa.",
      "{sleep} snu i jeszcze dziwi cię, że wszystko cię wkurwia? Dziś do łóżka przed północą.",
      "Opaska mówi: {sleep}. Opaska nie kłamie. Ty kłamiesz - że „jeszcze tylko jeden filmik”.",
      "Zasypiasz {fell} min po odłożeniu telefonu, a śpisz {sleep}. Matematyka jest bezlitosna. Jak ja.",
      "{sleep} snu. Kawa nie uratuje ci dziś dupy, ona też ma swoje granice.",
      "{sleep} snu. Worki pod oczami większe niż w Biedronce na promocji.",
    ],
    rested: [
      "{sleep} snu. Pełna noc - rzadki gatunek. Nie spierdol tego dziś wieczorem.",
      "Opaska melduje {sleep} snu. Kot jest pod wrażeniem, a kot nigdy nie jest pod wrażeniem.",
      "{sleep} snu i zero wymówek. Dziś nie masz prawa marudzić.",
      "Zasnąć {fell} min po odłożeniu telefonu? Tak się, kurwa, robi. {sleep} snu, szacun.",
      "{sleep} snu. Kurwa, aż dziwnie, że dziś nie mam się do czego przyczepić.",
    ],
  },
  soft: {
    bad: [
      "Po północy {social} min w social mediach. Dziś spróbuj odłożyć telefon wcześniej.",
      "Telefon odłożony ok. {asleep}. Krótsza noc = trudniejszy dzień. Dziś lepiej!",
      "Po północy {social} min w telefonie. Dziś spróbuj zostawić go poza sypialnią.",
    ],
    good: [
      "Czysta noc - zero social mediów po północy. Świetnie!",
      "Telefon odłożony o {asleep}. Dobra robota!",
      "Spokojna noc bez social mediów. Brawo!",
    ],
    short: [
      "Tylko {sleep} snu. Dziś spróbuj położyć się wcześniej.",
      "{sleep} snu to trochę mało. Wieczorem odłóż telefon odrobinę wcześniej.",
      "Krótka noc: {sleep}. Zadbaj dziś o siebie i o wcześniejszy sen.",
    ],
    rested: [
      "{sleep} snu - świetna noc!",
      "Zasypiasz {fell} min po odłożeniu telefonu i śpisz {sleep}. Pięknie!",
      "Udana noc: {sleep} snu. Tak trzymaj!",
    ],
  },
};

const BILL_EN: Record<TauntLevel, BillLines> = {
  hard: {
    bad: [
      "{social} minutes of social media after midnight. That's what your sleep cost. Worth it? It wasn't.",
      "Times you went back to that shit overnight: {visits}. Tonight the phone stays out of bed.",
      "Phone down at {asleep}. And then you wonder why you're a zombie in the morning.",
      "{apps}. The algorithms feasted and your sleep got fucked. Bravo.",
      "Night bill: {social} min of scrolling. You'll pay for it today in focus and mood.",
      "All that scrolling after midnight and you remember none of it. Tonight it goes down before 12.",
      "{social} min of social media after midnight. Your sleep got fucked and you don't even remember what for.",
      "Social media visits overnight: {visits}. Tonight the phone sleeps in the kitchen, damn it.",
      "{screen} min of screen at night. Your eyes look like two holes in the snow today.",
      "Night bill: {apps}. Paid in sleep, no cash accepted.",
    ],
    good: [
      "Zero social media after midnight. I don't believe it, but respect. Do it again tonight.",
      "A clean night. The algorithm cried and the bed was finally used for sleeping. As it should be.",
      "Phone down at {asleep} and no scrolling. The cat is proud. A little.",
      "A night without TikTok and Instagram. Maybe you'll amount to something after all.",
      "A clean night. The phone slept alone and the bed was used for sleeping. Damn, keep it up.",
      "Zero scrolling after midnight. The algorithm went hungry and sleep won. Respect.",
      "Phone down at {asleep}. It shows on your face this morning. Good job.",
    ],
    short: [
      "{sleep} of sleep. That's what a cat sleeps between two meals, not what a grown-up sleeps at night.",
      "Sleep: {sleep}. Your brain runs on fumes today, so no important decisions, for fuck's sake.",
      "{sleep} of sleep and you're surprised everything pisses you off? Bed before midnight tonight.",
      "The band says {sleep}. The band doesn't lie. You do - “just one more video”.",
      "Asleep {fell} min after the phone went down, and only {sleep} of sleep. Math is merciless. Like me.",
      "{sleep} of sleep. Coffee won't save your ass today, it has limits too.",
      "{sleep} of sleep. The bags under your eyes could carry a week of groceries.",
    ],
    rested: [
      "{sleep} of sleep. A full night - a rare species. Don't fuck it up tonight.",
      "The band reports {sleep} of sleep. The cat is impressed, and the cat is never impressed.",
      "{sleep} of sleep and zero excuses. No right to whine today.",
      "Asleep {fell} min after putting the phone down? That's how it's fucking done. {sleep} of sleep, respect.",
      "{sleep} of sleep. Damn, it's weird having nothing to pick on today.",
    ],
  },
  soft: {
    bad: [
      "{social} min on social media after midnight. Try putting the phone down earlier tonight.",
      "Phone down around {asleep}. Shorter night = harder day. Better tonight!",
      "{social} min on the phone after midnight. Tonight try leaving it outside the bedroom.",
    ],
    good: [
      "A clean night - zero social media after midnight. Great!",
      "Phone down at {asleep}. Nice work!",
      "A calm night without social media. Well done!",
    ],
    short: [
      "Only {sleep} of sleep. Try going to bed earlier tonight.",
      "{sleep} of sleep is a bit short. Put the phone down a little earlier tonight.",
      "A short night: {sleep}. Take it easy today and aim for an earlier bedtime.",
    ],
    rested: [
      "{sleep} of sleep - a great night!",
      "Asleep {fell} min after putting the phone down, and {sleep} of sleep. Lovely!",
      "A good night: {sleep} of sleep. Keep it up!",
    ],
  },
};

export function billLines(level: TauntLevel, userName: string | null): BillLines {
  const u = (l: string) => l.replaceAll("{u}", userName || L("ty", "you"));
  const b = pick(BILL, BILL_EN)[level];
  return {
    bad: b.bad.map(u),
    good: b.good.map(u),
    short: b.short.map(u),
    rested: b.rested.map(u),
  };
}

// ---------------------------------------------------------------------------
// Sleep from the band (NightReport.sleep)
// ---------------------------------------------------------------------------

/** Under this many minutes = a short night; this many or more = rested (mirrors SleepCalc). */
export const SHORT_SLEEP_MIN = 6 * 60;
export const RESTED_SLEEP_MIN = 7 * 60;
/** Phone-down and sleep start further apart than this aren't compared. */
const FELL_MAX = 6 * 60;

/** "6 h 12 min", "7 h", "45 min" (mirrors SleepCalc.duration). */
export function fmtSleep(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** Minutes asleep that night, null when the band didn't report. */
export const sleepMinutes = (r: NightReport): number | null =>
  r.sleep && r.sleep.minutes >= 0 ? r.sleep.minutes : null;

/** "00:48–07:00". */
export const sleepRange = (r: NightReport): string =>
  r.sleep ? `${formatMinute(r.sleep.start)}–${formatMinute(r.sleep.end)}` : "";

/**
 * Minutes from putting the phone down to falling asleep (across midnight);
 * negative = the phone went down after falling asleep; null when not both
 * known or too far apart to compare. Mirrors SleepCalc.fellAfter.
 */
export function fellAfter(r: NightReport): number | null {
  if (!r.sleep || r.asleep == null || r.asleep < 0 || r.sleep.start < 0) return null;
  let d = (((r.sleep.start - r.asleep) % 1440) + 1440) % 1440;
  if (d >= 720) d -= 1440;
  return Math.abs(d) > FELL_MAX ? null : d;
}

/** "zasypiasz 18 min po odłożeniu telefonu" / the jab when the phone went down after sleep. */
export function fellLine(r: NightReport): string | null {
  const f = fellAfter(r);
  if (f == null) return null;
  return f >= 0
    ? L(`zasypiasz ${f} min po odłożeniu telefonu`, `asleep ${f} min after the phone went down`)
    : L(`telefon odłożony ${-f} min po zaśnięciu?!`, `phone down ${-f} min after falling asleep?!`);
}

/** Minutes slept per night (keyed by the evening's date) - the CSV's sleep column. */
export function sleepByDate(reports: Record<string, NightReport>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of Object.values(reports)) {
    const m = sleepMinutes(r);
    if (m != null) out[r.date] = m;
  }
  return out;
}

/** Average minutes slept over the nights filed under [from, to) day keys; null without data. */
function avgSleep(
  reports: Record<string, NightReport>,
  from: string,
  to: string,
): { avg: number; nights: number } | null {
  const v = Object.values(reports)
    .filter((r) => r.date >= from && r.date < to)
    .map(sleepMinutes)
    .filter((m): m is number => m != null);
  if (v.length === 0) return null;
  return { avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length), nights: v.length };
}

/**
 * Sleep over the last 7 nights vs the 7 before (last night = filed under
 * yesterday). `delta` only when both weeks have at least 3 nights.
 */
export function sleepWeeks(
  reports: Record<string, NightReport>,
  now: Date = new Date(),
): {
  last: { avg: number; nights: number } | null;
  prev: { avg: number; nights: number } | null;
  delta: number | null;
} {
  const k = (d: number) => todayKey(addDays(now, -d));
  const last = avgSleep(reports, k(7), k(0));
  const prev = avgSleep(reports, k(14), k(7));
  const delta = last && prev && last.nights >= 3 && prev.nights >= 3 ? last.avg - prev.avg : null;
  return { last, prev, delta };
}

/** "3× Instagram (22 min) · 1× YouTube (25 min)" (mirrors NightStats.appsLine). */
export function appsLine(r: NightReport): string {
  return (r.apps ?? []).map((a) => `${a.visits}× ${a.label} (${a.minutes} min)`).join(" · ");
}

/** Resolve the placeholders (mirrors NightStats.fill). */
export function fillBill(line: string, r: NightReport): string {
  const sleep = sleepMinutes(r);
  const fell = fellAfter(r);
  return line
    .replaceAll("{social}", String(r.social ?? 0))
    .replaceAll("{screen}", String(r.screen ?? 0))
    .replaceAll("{visits}", String(r.visits ?? 0))
    .replaceAll("{asleep}", r.asleep != null && r.asleep >= 0 ? formatMinute(r.asleep) : "?")
    .replaceAll("{sleep}", sleep != null ? fmtSleep(sleep) : "?")
    .replaceAll("{fell}", fell != null ? String(Math.abs(fell)) : "?")
    .replaceAll("{apps}", appsLine(r));
}

/** Whether a line's placeholders can be filled for this night (mirrors NightStats.usable). */
export function usableLine(line: string, r: NightReport): boolean {
  if (line.includes("{asleep}") && (r.asleep == null || r.asleep < 0)) return false;
  if (line.includes("{sleep}") && sleepMinutes(r) == null) return false;
  const fell = fellAfter(r);
  return !line.includes("{fell}") || (fell != null && fell >= 0);
}

/** A bad night = any social media after midnight. */
export const badNight = (r: NightReport) => (r.social ?? 0) > 0;

/**
 * Which comment pools fit a night (mirrors SleepCalc.billPools): a short
 * night gets the short-sleep jabs (plus the social ones if it also scrolled),
 * scrolling gets "bad", a clean 7 h+ night "good" + "rested".
 */
export function billPools(r: NightReport): BillPool[] {
  const bad = badNight(r);
  const sleep = sleepMinutes(r);
  if (sleep != null && sleep < SHORT_SLEEP_MIN) return bad ? ["bad", "short"] : ["short"];
  if (bad) return ["bad"];
  if (sleep != null && sleep >= RESTED_SLEEP_MIN) return ["good", "rested"];
  return ["good"];
}

/** Pick Szpila's comment for a night (deterministic per date so it doesn't flicker). */
export function billComment(r: NightReport, level: TauntLevel, userName: string | null): string {
  const lines = billLines(level, userName);
  const of = (keys: BillPool[]) => keys.flatMap((k) => lines[k]).filter((l) => usableLine(l, r));
  let usable = of(billPools(r));
  if (usable.length === 0) usable = of([badNight(r) ? "bad" : "good"]);
  let h = 0;
  for (const ch of r.date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fillBill(usable[h % usable.length], r);
}
