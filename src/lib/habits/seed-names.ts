// Default habit names and units in both languages. When the language changes,
// habits that still carry a default name (from the seeds or the templates) are
// renamed to the other language; anything the user typed stays as it is.
import type { Habit } from "./types";
import type { Lang } from "@/lib/i18n";

/** [Polish, English] names of seeds and templates. */
export const NAME_PAIRS: [string, string][] = [
  ["Mycie zębów", "Brush teeth"],
  ["Picie wody", "Drink water"],
  ["8000 kroków", "8000 steps"],
  ["Czytanie książki", "Read a book"],
  ["Programuj", "Code"],
  ["Ucz się języka obcego", "Learn a language"],
  ["Scrollowanie w łóżku", "Scrolling in bed"],
  ["Fast food", "Fast food"],
  ["Siłownia", "Gym"],
  ["Medytacja", "Meditation"],
  ["Ruch 30 min", "Move 30 min"],
  ["Spacer", "Walk"],
  ["Bieganie", "Running"],
  ["Rozciąganie", "Stretching"],
  ["Witaminy", "Vitamins"],
  ["Warzywa", "Vegetables"],
  ["Owoce", "Fruit"],
  ["Dziennik", "Journal"],
  ["Nauka", "Study"],
  ["Sen przed 23:00", "Asleep by 11 pm"],
  ["Słodycze", "Sweets"],
  ["Alkohol", "Alcohol"],
  ["Papierosy", "Cigarettes"],
  ["Oglądanie pornografii", "Watching porn"],
  ["Pornografia", "Porn"],
  ["Nie bądź zboczeńcem", "Don't be a perv"],
  ["Pomijanie posiłków", "Skipping meals"],
  ["Impulsywne wydawanie", "Impulse spending"],
  ["Impulsywne zakupy", "Impulse shopping"],
  ["Hazard", "Gambling"],
  ["Obgryzanie paznokci", "Nail biting"],
  ["Za dużo kawy", "Too much coffee"],
  ["Prokrastynacja", "Procrastination"],
  ["Drzemka po budziku", "Snoozing the alarm"],
  ["Binge-watching", "Binge-watching"],
  ["Energetyki", "Energy drinks"],
  ["Scrollowanie rolek", "Scrolling reels"],
  ["Seriale do nocy", "Shows till late"],
  ["Zakupy impulsywne", "Impulse buys"],
  ["Drzemka budzika", "Hitting snooze"],
  ["Kawa po 16:00", "Coffee after 4 pm"],
];

/** [Polish, English] units (Polish genitive plural, as stored in goal.unit). */
export const UNIT_PAIRS: [string, string][] = [
  ["szklanek", "glasses"],
  ["kroków", "steps"],
  ["razy", "times"],
  ["stron", "pages"],
  ["km", "km"],
  ["porcji", "servings"],
  ["tabletek", "pills"],
  ["zadań", "tasks"],
  ["słówek", "words"],
  ["powtórzeń", "reps"],
  ["serii", "sets"],
];

function translate(value: string, pairs: [string, string][], to: Lang): string {
  const from = to === "en" ? 0 : 1;
  const hit = pairs.find((p) => p[from] === value);
  return hit ? hit[to === "en" ? 1 : 0] : value;
}

export const translateName = (name: string, to: Lang) => translate(name, NAME_PAIRS, to);
export const translateUnit = (unit: string, to: Lang) => translate(unit, UNIT_PAIRS, to);

/** A habit with its default name/unit in the other language (user-typed ones unchanged). */
export function translateHabit<T extends Omit<Habit, "id" | "createdAt">>(h: T, to: Lang): T {
  const name = translateName(h.name, to);
  const unit = h.goal?.unit ? translateUnit(h.goal.unit, to) : undefined;
  if (name === h.name && unit === h.goal?.unit) return h;
  return { ...h, name, ...(h.goal && unit ? { goal: { ...h.goal, unit } } : {}) };
}
