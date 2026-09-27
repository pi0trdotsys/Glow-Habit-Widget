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

export const EN_T = {
  HARD: HARD_EN,
  SOFT: SOFT_EN,
  RAGE_HARD: RAGE_HARD_EN,
  RAGE_SOFT: RAGE_SOFT_EN,
  CAUGHT: CAUGHT_EN,
  CAUGHT_SOCIAL: CAUGHT_SOCIAL_EN,
  ALL_DONE: ALL_DONE_EN,
  EVENING: EVENING_EN,
  EMPTY: EMPTY_EN,
  MORE_HARD: MORE_HARD_EN,
  MORE_RAGE: MORE_RAGE_EN,
  MOTIVATE: MOTIVATE_EN,
  EXTRA_HARD: EXTRA_HARD_EN,
  EXTRA_SOFT: EXTRA_SOFT_EN,
};
