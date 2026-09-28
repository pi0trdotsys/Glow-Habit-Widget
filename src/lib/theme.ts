// Light / dark theme. "system" follows the phone. The chosen theme lands on
// <html data-theme="dark|light">, which switches the CSS variables in
// styles.css; on Android the status/navigation bar icons follow too.
import { Capacitor, registerPlugin } from "@capacitor/core";

export type ThemePref = "system" | "dark" | "light";
export type Theme = "dark" | "light";

/** The theme to show for a preference (system = the OS preference, dark if unknown). */
export function resolveTheme(pref: ThemePref, systemDark: boolean | null): Theme {
  if (pref === "dark" || pref === "light") return pref;
  return systemDark === false ? "light" : "dark";
}

export function systemPrefersDark(): boolean | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  return !window.matchMedia("(prefers-color-scheme: light)").matches;
}

/** Background of each theme (meta theme-color, native system bars). Mirrors --background. */
export const THEME_BG: Record<Theme, string> = { dark: "#15161c", light: "#f5f6fa" };

interface BarsPlugin {
  systemBars(opts: { light: boolean; background: string }): Promise<void>;
}
const Native = registerPlugin<BarsPlugin>("HabitWidget");

/** Apply a theme to the document (and the Android system bars). */
export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (root.dataset.theme !== theme) root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", THEME_BG[theme]);
  if (Capacitor.isNativePlatform()) {
    void Native.systemBars({ light: theme === "light", background: THEME_BG[theme] }).catch(
      () => {},
    );
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
