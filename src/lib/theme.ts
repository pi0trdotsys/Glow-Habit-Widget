// App themes (palettes). "system" follows the phone (dark / light). The chosen theme lands
// on <html data-theme="<id>">, which switches the CSS variables in styles.css (any element
// with data-theme gets that palette - the theme picker's previews use it); on Android the
// status/navigation bar icons follow too, and the widgets can follow the app theme
// (snapshot "theme", WidgetTheme.java).
import { Capacitor, registerPlugin } from "@capacitor/core";

/** Every palette, in the order the picker shows them. Mirrors the blocks in styles.css. */
export const THEMES = [
  "dark",
  "light",
  "amoled",
  "glitch",
  "terminal",
  "ocean",
  "sunset",
  "sakura",
] as const;

export type Theme = (typeof THEMES)[number];
export type ThemePref = "system" | Theme;

export interface ThemeMeta {
  /** Light palette: dark text, dark system bar icons, color-scheme: light. */
  light: boolean;
  /** --background as hex (meta theme-color, native system bars). */
  bg: string;
  /** Picker name: [polski, English]. */
  name: readonly [string, string];
}

export const THEME_META: Record<Theme, ThemeMeta> = {
  dark: { light: false, bg: "#0b0d13", name: ["Ciemny", "Dark"] },
  light: { light: true, bg: "#f6f7fa", name: ["Jasny", "Light"] },
  amoled: { light: false, bg: "#000000", name: ["AMOLED", "AMOLED"] },
  glitch: { light: false, bg: "#000000", name: ["Glitch Pixel", "Glitch Pixel"] },
  terminal: { light: false, bg: "#020a03", name: ["Terminal", "Terminal"] },
  ocean: { light: false, bg: "#021624", name: ["Ocean", "Ocean"] },
  sunset: { light: false, bg: "#1f0b1d", name: ["Zachód", "Sunset"] },
  sakura: { light: true, bg: "#fdf1f6", name: ["Sakura", "Sakura"] },
};

/** Background of each theme (meta theme-color, native system bars). Mirrors --background. */
export const THEME_BG = Object.fromEntries(THEMES.map((t) => [t, THEME_META[t].bg])) as Record<
  Theme,
  string
>;

export function isTheme(v: unknown): v is Theme {
  return typeof v === "string" && (THEMES as readonly string[]).includes(v);
}

export function isThemePref(v: unknown): v is ThemePref {
  return v === "system" || isTheme(v);
}

export function isLightTheme(t: Theme): boolean {
  return THEME_META[t]?.light ?? false;
}

/**
 * The theme to show for a preference: an explicit palette wins; "system" (and anything
 * unknown, e.g. a palette from a newer backup) = the OS preference, dark if unknown.
 */
export function resolveTheme(pref: ThemePref | string, systemDark: boolean | null): Theme {
  if (isTheme(pref)) return pref;
  return systemDark === false ? "light" : "dark";
}

/**
 * Inline, pre-hydration script (__root.tsx): the stored preference -> <html data-theme>,
 * so a non-default theme shows from the first paint. Same rules as resolveTheme().
 */
export const THEME_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem("loop-habits-v1")||"{}").state||{};var p=s.theme;var t=${JSON.stringify(THEMES.join(" "))}.split(" ").indexOf(p)<0?(window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):p;document.documentElement.dataset.theme=t;}catch(e){}})();`;

export function systemPrefersDark(): boolean | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return !window.matchMedia("(prefers-color-scheme: light)").matches;
}

interface BarsPlugin {
  systemBars(opts: { light: boolean; background: string }): Promise<void>;
}
const Native = registerPlugin<BarsPlugin>("HabitWidget");

/** Apply a theme to the document (and the Android system bars). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const light = isLightTheme(theme);
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  root.style.colorScheme = light ? "light" : "dark";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_BG[theme]);
  if (Capacitor.isNativePlatform()) {
    void Native.systemBars({ light, background: THEME_BG[theme] }).catch(() => {});
  }
}

/** Keep the document in sync with the preference (and the OS, for "system"). Returns cleanup. */
export function watchTheme(getPref: () => ThemePref): () => void {
  const update = () => applyTheme(resolveTheme(getPref(), systemPrefersDark()));
  update();
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-color-scheme: light)");
  mq.addEventListener?.("change", update);
  return () => mq.removeEventListener?.("change", update);
}
