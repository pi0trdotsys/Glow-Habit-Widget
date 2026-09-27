// Two languages: Polish (the original) and English. Strings live inline next
// to the code as L("polski", "English") - no key files to keep in sync. The
// current language is a module-level value kept in sync with the store
// (useHabits.language, see store.ts), so plain functions (Szpila's lines,
// labels, stats) can use L() too. AppShell re-mounts the screen when the
// language changes, so every L() call re-renders.
import { enUS, pl as plLocale } from "date-fns/locale";

export type Lang = "pl" | "en";

/** Phone/browser language: Polish if it's Polish, English otherwise. */
export function detectLang(): Lang {
  if (typeof navigator === "undefined") return "pl";
  const langs = [...(navigator.languages ?? []), navigator.language].filter(Boolean);
  if (langs.length === 0) return "pl";
  return langs[0].toLowerCase().startsWith("pl") ? "pl" : "en";
}

let current: Lang = "pl";

export const getLang = (): Lang => current;
export const isEn = (): boolean => current === "en";

/** Called by the store on start and whenever the language changes. */
export function setLang(lang: Lang): void {
  current = lang === "en" ? "en" : "pl";
  if (typeof document !== "undefined" && document.documentElement.lang !== current)
    document.documentElement.lang = current;
}

/** Inline translation: the Polish or the English variant for the current language. */
export function L(pl: string, en: string): string {
  return current === "en" ? en : pl;
}

/** Same, for any value (e.g. whole line tables, JSX). */
export function pick<T>(pl: T, en: T): T {
  return current === "en" ? en : pl;
}

/** date-fns locale for the current language. */
export function dateLocale() {
  return current === "en" ? enUS : plLocale;
}

/** BCP 47 tag for Intl / toLocaleDateString. */
export function intlLocale(): string {
  return current === "en" ? "en-GB" : "pl-PL";
}

/**
 * Plural form. Polish: [1, 2-4 (not 12-14), 5+]; English: [1, other].
 * plural(3, ["zadanie", "zadania", "zadań"], ["task", "tasks"]) -> "zadania" / "tasks"
 */
export function plural(
  n: number,
  plForms: [string, string, string],
  enForms: [string, string],
): string {
  if (current === "en") return n === 1 ? enForms[0] : enForms[1];
  return plPlural(n, plForms);
}

export function plPlural(n: number, [one, few, many]: [string, string, string]): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
}

export const LANGUAGES: { id: Lang; label: string; flag: string }[] = [
  { id: "pl", label: "Polski", flag: "🇵🇱" },
  { id: "en", label: "English", flag: "🇬🇧" },
];
