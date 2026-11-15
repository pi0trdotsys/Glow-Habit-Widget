// "Dyskretne" forbidden habits: some of them are nobody's business (porn, alcohol, gambling...).
// A discreet habit never leaves the app - no notification, lock screen or widget shows it -
// and on the Today screen it sits below the fold, so a glance at the phone doesn't reveal it.
import type { Habit } from "./types";
import { kindOf } from "./utils";
import { L } from "@/lib/i18n";

/**
 * Name fragments generally seen as sensitive (Polish and English, lower case, no diacritics
 * needed - names are normalised first). Word starts, so "piwo" matches "Piwo w tygodniu".
 */
const SENSITIVE = [
  // sex
  "porn",
  "masturb",
  "onan",
  "seks",
  "sex",
  "erot",
  "nsfw",
  "onlyfans",
  // alcohol
  "alkohol",
  "alcohol",
  "piwo",
  "piwa",
  "beer",
  "wodk",
  "vodka",
  "wino",
  "wine",
  "drink",
  "pijan",
  "picie alk",
  "booze",
  // drugs, nicotine
  "narkot",
  "drugs",
  "trawk",
  "ziolo",
  "weed",
  "marihuan",
  "cannabis",
  "kokain",
  "cocaine",
  "amfetamin",
  "mefedron",
  "dopalacz",
  "papieros",
  "cigarett",
  "smoking",
  "palenie",
  "fajk",
  "vape",
  "wape",
  "e-pap",
  "nikotyn",
  "nicotin",
  "tyton",
  "snus",
  // gambling
  "hazard",
  "gambl",
  "bukmach",
  "zaklad",
  "betting",
  "kasyn",
  "casino",
  "ruletk",
  "poker",
  // self-harm
  "samookal",
  "self-harm",
  "selfharm",
  "ciecie sie",
];

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

/** Does this name look like something people usually keep to themselves? */
export function looksSensitive(name: string): boolean {
  const n = fold(name);
  return SENSITIVE.some((s) => new RegExp(`(^|[^a-z])${s.replace(/[-]/g, "\\-")}`).test(n));
}

/** Discreet = an avoid habit, switched on by hand or (by default) with a sensitive name. */
export function isDiscreet(h: Habit): boolean {
  if (kindOf(h) !== "avoid") return false;
  return h.discreet ?? looksSensitive(h.name);
}

/** What native surfaces get instead of the name (never shown by design, but never the real one). */
export const discreetLabel = () => L("Zadanie dyskretne", "Private habit");
