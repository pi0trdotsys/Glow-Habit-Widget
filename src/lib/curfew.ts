// "Cisza nocna" (curfew): after the deadline (default 00:00) every app outside
// a short allow list is blocked straight away (LiveGuardService.curfewBlock).
// Why it works better than willpower:
//  - friction, not motivation: the default at night becomes "nothing works",
//    and an exception costs effort (a hold that doubles each time: 10/20/40/60 s);
//  - a felt cost: each urgent pass darkens the screen and takes 10 min (and every
//    social media minute after midnight 2 min) off tomorrow's daily limit;
//  - the phone goes down physically: plugging it in at night is noticed and
//    praised, unplugging it after the deadline gets a jab;
//  - a streak of clean nights to protect (loss aversion), on the night bill.
// Placeholders: {app} {time} {count} (urgent passes tonight) {until} (morning)
// {left} (minutes to the morning) - resolved natively by LiveGuardService.curfewFill.
import type { TauntLevel } from "@/lib/habits/store";
import type { NightReport } from "@/lib/sensors";
import { pick } from "@/lib/i18n";
import { addDays } from "date-fns";
import { todayKey } from "@/lib/habits/utils";

/** Mirrors DayGuard.DEBT_PER_SOCIAL_MIN / DEBT_PER_PASS / DEBT_FLOOR_MIN. */
export const DEBT_PER_SOCIAL_MIN = 2;
export const DEBT_PER_PASS = 10;
export const DEBT_FLOOR_MIN = 15;
/** Mirrors LiveGuard.CURFEW_PASS_MIN and the hold times. */
export const CURFEW_PASS_MIN = 3;

export type CurfewLines = { curfew: string[]; pass: string[]; charger: string[]; unplug: string[] };

const PL: Record<TauntLevel, CurfewLines> = {
  hard: {
    curfew: [
      "Jest {time}. {app} śpi, telefon śpi, tylko ty jeszcze nie. Odłóż to, kurwa.",
      "Cisza nocna. {app} będzie tu rano, twój sen już nie.",
      "O {time} w {app} nie ma nic mądrego. Jest tylko mniej snu i więcej gówna w głowie.",
      "Telefon ma szlaban do {until}. Ty też.",
      "Serio? {time} i {app}? Do {until} zostało {left} minut i każda należy do poduszki.",
      "Nocna wersja ciebie podejmuje chujowe decyzje. Dzienna poprosiła mnie, żeby to przerwać. Przerywam.",
      "Telefon po północy jest jak lodówka o trzeciej: nic dobrego tam nie ma.",
      "Budzik działa, telefon działa, reszta ma wolne do {until}. Ty też masz wolne. Śpij.",
      "Pojebało? Jest {time}. Odkładaj.",
      "Wyjątków tej nocy: {count}. Jutrzejszy limit już się kurczy, a ty dalej klikasz.",
      "{app} o {time}? Algorytm zaciera łapy, a ty jutro będziesz wyglądać jak zbity pies.",
      "Wszystko, co teraz zobaczysz w {app}, jest gówno warte. Sen nie.",
      "Tu nie ma nic do roboty. Serio, nic. Zgaś ekran i zamknij oczy.",
      "Za {left} minut dzwoni prawdziwe życie. Prześpij chociaż kawałek tej nocy.",
      "Nie ma „jeszcze tylko jedno”. Jest {time} i jest szlaban. Koniec dyskusji.",
      "Każda minuta teraz to minuta mniej jutro. Rachunek przyjdzie rano, jak zawsze.",
    ],
    pass: [
      "{count}. wyjątek tej nocy. Masz 3 minuty, a ekran zaraz zrobi się czerwony jak twoje oczy rano.",
      "Dobra, 3 minuty. Jutro limit będzie krótszy o 10 min. Warto było?",
      "Wyjątek nr {count}. Mam nadzieję, że to naprawdę pilne, a nie kolejna pierdolona rolka.",
      "Trzy minuty i ani sekundy więcej. Ekran ciemnieje, licznik tyka.",
      "{count}. raz trzymasz ten przycisk. Następnym razem potrzymasz dwa razy dłużej.",
    ],
    charger: [
      "Telefon na ładowarce o {time}. Szanuję. Niech tam leży do rana.",
      "{time} i telefon podpięty. Najlepsza decyzja dzisiejszego wieczoru.",
      "Ładowarka zaliczona o {time}. Jeśli stoi poza łóżkiem - legenda.",
      "Telefon odłożony o {time}. Teraz najtrudniejsze: nie brać go z powrotem.",
    ],
    unplug: [
      "Odłączasz telefon o {time}? Ja wszystko widzę. Z powrotem na kabel.",
      "{time}, a telefon zdjęty z ładowarki. Nie, nie, nie. Odkładaj.",
      "Kabel wypięty o {time}. Jeśli to nie budzik, to wiesz, co o tym myślę.",
      "O {time} telefon wraca do łapy? Wracaj do spania, do cholery.",
    ],
  },
  soft: {
    curfew: [
      "Jest {time} - cisza nocna do {until}. Odłóż telefon, sen jest ważniejszy.",
      "Pora spać. {app} poczeka do rana.",
      "Do {until} zostało {left} minut. Każda z nich przyda się jutro.",
    ],
    pass: ["Wyjątek nr {count}. Masz 3 minuty.", "Dobrze, 3 minuty. Potem spać."],
    charger: ["Telefon na ładowarce o {time}. Dobranoc!", "Odłożone o {time}. Świetnie!"],
    unplug: ["Telefon odłączony o {time}. Wróć do spania.", "Jest {time}. Telefon może poczekać."],
  },
};

const EN: Record<TauntLevel, CurfewLines> = {
  hard: {
    curfew: [
      "It's {time}. {app} is asleep, the phone is asleep, only you aren't. Put it down, damn it.",
      "Curfew. {app} will still be here in the morning. Your sleep won't.",
      "Nothing in {app} at {time} is worth a shit. Sleep is.",
      "The phone is grounded until {until}. So are you.",
      "Seriously? {time} and {app}? {left} minutes till {until}, and every one of them belongs to the pillow.",
      "Night-you makes shitty decisions. Day-you asked me to stop this. Stopping it.",
      "The phone after midnight is like the fridge at 3 am: nothing good in there.",
      "The alarm works, calls work, everything else is off until {until}. You're off too. Sleep.",
      "Are you fucking kidding me? It's {time}. Put it down.",
      "Urgent passes tonight: {count}. Tomorrow's limit is already shrinking and you're still tapping.",
      "{app} at {time}? The algorithm is rubbing its paws and tomorrow you'll look like a kicked dog.",
      "Everything you'd see in {app} right now is worthless. Sleep isn't.",
      "There's nothing to do here. Seriously, nothing. Screen off, eyes shut.",
      "Real life rings in {left} minutes. Sleep through at least part of this night.",
      "There's no “just one more”. It's {time} and you're grounded. End of discussion.",
      "Every minute now is a minute less tomorrow. The bill comes in the morning, as always.",
    ],
    pass: [
      "Urgent pass no. {count} tonight. 3 minutes, and the screen is about to go as red as your eyes tomorrow.",
      "Fine, 3 minutes. Tomorrow's limit just got 10 min shorter. Worth it?",
      "Pass no. {count}. I hope it's actually urgent and not another fucking reel.",
      "Three minutes and not a second more. The screen is darkening, the clock is ticking.",
      "That's hold no. {count}. Next time you'll hold twice as long.",
    ],
    charger: [
      "Phone on the charger at {time}. Respect. Let it lie there till morning.",
      "{time} and the phone is plugged in. Best decision of the evening.",
      "Charger done at {time}. If it's away from the bed - legend.",
      "Phone down at {time}. Now the hard part: not picking it back up.",
    ],
    unplug: [
      "Unplugging the phone at {time}? I see everything. Back on the cable.",
      "{time} and the phone is off the charger. No, no, no. Put it down.",
      "Cable out at {time}. If it's not the alarm, you know what I think of it.",
      "The phone's back in your paws at {time}? Back to sleep, for fuck's sake.",
    ],
  },
  soft: {
    curfew: [
      "It's {time} - curfew until {until}. Put the phone down, sleep matters more.",
      "Time to sleep. {app} can wait till morning.",
      "{left} minutes till {until}. You'll need every one of them tomorrow.",
    ],
    pass: ["Urgent pass no. {count}. You've got 3 minutes.", "Okay, 3 minutes. Then sleep."],
    charger: ["Phone on the charger at {time}. Good night!", "Put down at {time}. Great!"],
    unplug: ["Phone unplugged at {time}. Go back to sleep.", "It's {time}. The phone can wait."],
  },
};

export function curfewLines(level: TauntLevel): CurfewLines {
  return pick(PL, EN)[level];
}

/** Minutes a night takes off the next day's limit (mirrors DayGuard.debtMin). */
export function nightDebt(
  r: Pick<NightReport, "social" | "curfewPasses"> | null,
  limit: number,
): number {
  if (!r) return 0;
  const d =
    DEBT_PER_SOCIAL_MIN * Math.max(0, r.social ?? 0) +
    DEBT_PER_PASS * Math.max(0, r.curfewPasses ?? 0);
  return Math.max(0, Math.min(d, limit - DEBT_FLOOR_MIN));
}

/** A clean night: no social media after midnight and no urgent pass through the curfew. */
export const cleanNight = (r: NightReport) => (r.social ?? 0) === 0 && (r.curfewPasses ?? 0) === 0;

/** Clean nights in a row, counting back from last night (a night without a report ends it). */
export function cleanNightStreak(
  reports: Record<string, NightReport>,
  now: Date = new Date(),
): number {
  // A night is filed under its evening: the last finished one is yesterday's (tonight isn't over).
  const start = addDays(now, -1);
  let n = 0;
  for (let i = 0; i < 365; i++) {
    const r = reports[todayKey(addDays(start, -i))];
    if (!r || !r.granted || !cleanNight(r)) break;
    n++;
  }
  return n;
}
