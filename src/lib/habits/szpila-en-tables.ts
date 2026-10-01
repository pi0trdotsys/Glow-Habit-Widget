// English line tables for Szpila, bundled separately and loaded only when the
// app is in English (loadEnglishLines() in szpila.ts) - Polish users never
// download or parse them at startup.
import {
  ALL_DONE_EN,
  CAUGHT_EN,
  CAUGHT_SOCIAL_EN,
  EMPTY_EN,
  EVENING_EN,
  HARD_EN,
  MORE_HARD_EN,
  MORE_RAGE_EN,
  MOTIVATE_EN,
  RAGE_HARD_EN,
  RAGE_SOFT_EN,
  SOFT_EN,
} from "./szpila-en";
import { EXTRA_HARD_EN, EXTRA_SOFT_EN } from "./szpila-en-extra";
import {
  ALL_DONE_27_EN,
  CAUGHT_27_EN,
  CAUGHT_SOCIAL_27_EN,
  EVENING_27_EN,
  HARD_27_EN,
  MOTIVATE_27_EN,
  RAGE_SOFT_27_EN,
  SOFT_27_EN,
} from "./szpila-en-27";
import { HARD_27X_EN, SOFT_27X_EN } from "./szpila-en-27-extra";
import { CTX_HARD_EN, CTX_SOFT_EN } from "./szpila-en-ctx";
import { mergeLevels, type Lines27 } from "./szpila-27";
import type { Category } from "./szpila";

export const EN_T = {
  HARD: HARD_EN,
  SOFT: SOFT_EN,
  RAGE_HARD: RAGE_HARD_EN,
  RAGE_SOFT: RAGE_SOFT_EN,
  CAUGHT: mergeLevels(CAUGHT_EN, CAUGHT_27_EN),
  CAUGHT_SOCIAL: mergeLevels(CAUGHT_SOCIAL_EN, CAUGHT_SOCIAL_27_EN),
  ALL_DONE: mergeLevels(ALL_DONE_EN, ALL_DONE_27_EN),
  EVENING: mergeLevels(EVENING_EN, EVENING_27_EN),
  EMPTY: EMPTY_EN,
  MORE_HARD: MORE_HARD_EN,
  MORE_RAGE: MORE_RAGE_EN,
  MOTIVATE: MOTIVATE_EN,
  EXTRA_HARD: EXTRA_HARD_EN,
  EXTRA_SOFT: EXTRA_SOFT_EN,
  X27: { ...HARD_27_EN, ...HARD_27X_EN } as Partial<Record<Category, Lines27>>,
  S27: { ...SOFT_27_EN, ...SOFT_27X_EN } as Partial<Record<Category, Lines27>>,
  RAGE_SOFT27: RAGE_SOFT_27_EN,
  M27: MOTIVATE_27_EN,
  CTX_H: CTX_HARD_EN,
  CTX_S: CTX_SOFT_EN,
};
