import { describe, expect, test } from "bun:test";
import {
  isLightTheme,
  isThemePref,
  resolveTheme,
  THEME_BG,
  THEME_BOOT,
  THEME_META,
  THEMES,
  type Theme,
} from "@/lib/theme";
import { useHabits } from "@/lib/habits/store";
import { themeFields } from "@/lib/widget/bridge";
import { confettiColors, makePieces } from "@/components/Confetti";
import { colorDistance, contrast, cssPalettes } from "./color";

const palettes = cssPalettes();
const HABITS = ["mint", "coral", "amber", "violet", "sky", "rose", "lime", "sand"];

describe("theme palettes (styles.css)", () => {
  test("every theme has a palette block and every block a theme", () => {
    expect(Object.keys(palettes).sort()).toEqual([...THEMES].sort());
  });

  test("each palette declares every variable of the light one (and nothing it lacks)", () => {
    const want = Object.keys(palettes.light).sort();
    for (const t of THEMES) {
      const have = Object.keys(palettes[t])
        .filter((k) => !k.startsWith("--glitch-"))
        .sort();
      expect({ t, have }).toEqual({ t, have: t === "dark" ? have : want });
      for (const k of want) expect({ t, k, set: k in palettes[t] }).toEqual({ t, k, set: true });
    }
  });

  test("color-scheme and the light flag agree; THEME_BG mirrors --background", () => {
    for (const t of THEMES) {
      expect({ t, scheme: palettes[t]["color-scheme"] }).toEqual({
        t,
        scheme: isLightTheme(t) ? "light" : "dark",
      });
      const d = colorDistance(THEME_BG[t], palettes[t]["--background"]);
      expect({ t, close: d <= 2 }).toEqual({ t, close: true });
    }
  });

  for (const t of THEMES) {
    test(`${t}: readable (WCAG contrast)`, () => {
      const v = palettes[t];
      const ratio = (a: string, b: string) => contrast(v[a], v[b]);
      const atLeast = (a: string, b: string, min: number) =>
        expect({ t, pair: `${a} on ${b}`, ok: ratio(a, b) >= min, ratio: ratio(a, b) }).toEqual({
          t,
          pair: `${a} on ${b}`,
          ok: true,
          ratio: ratio(a, b),
        });
      atLeast("--foreground", "--background", 7);
      atLeast("--foreground", "--card", 7);
      // the E2E check wants 7:1 for the default (dark) theme, 4.5:1 for the others
      atLeast("--muted-foreground", "--background", t === "dark" ? 7 : 4.5);
      atLeast("--muted-foreground", "--card", 4.5);
      atLeast("--primary-foreground", "--primary", 4.5);
      atLeast("--accent-foreground", "--accent", 4.5);
      atLeast("--secondary-foreground", "--secondary", 4.5);
      // accents used as text (labels, counters, "zakazane" red)
      atLeast("--primary", "--card", 4.5);
      atLeast("--avoid", "--card", 4.5);
      atLeast("--avoid", "--background", 4.5);
      // habit colours: rings, dots and icons (non-text UI, 3:1)
      for (const h of HABITS) atLeast(`--habit-${h}`, "--card", 3);
      // light themes really are light (as the E2E light check asserts)
      if (isLightTheme(t)) expect(contrast(v["--background"], "#000000")).toBeGreaterThan(15);
      else expect(contrast(v["--background"], "#ffffff")).toBeGreaterThan(15);
    });
  }
});

describe("theme model", () => {
  test("an explicit palette wins; system and unknown values follow the phone (dark if unknown)", () => {
    for (const t of THEMES) {
      expect(resolveTheme(t, true)).toBe(t);
      expect(resolveTheme(t, false)).toBe(t);
    }
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", null)).toBe("dark");
    expect(resolveTheme("neon-from-the-future", false)).toBe("light");
    expect(resolveTheme("", null)).toBe("dark");
  });

  test("light flags and names", () => {
    expect(THEMES.filter(isLightTheme)).toEqual(["light", "sakura"]);
    expect(isThemePref("system")).toBe(true);
    expect(isThemePref("glitch")).toBe(true);
    expect(isThemePref("neon")).toBe(false);
    expect(isThemePref(undefined)).toBe(false);
    for (const t of THEMES) {
      const [pl, en] = THEME_META[t].name;
      expect(pl.length).toBeGreaterThan(2);
      expect(en).not.toMatch(/[ąćęłńóśźż]/i);
    }
  });

  test("THEME_BOOT (pre-hydration) picks the same theme as resolveTheme", () => {
    const run = (stored: string | null, systemLight: boolean | null) => {
      const html = { dataset: {} as Record<string, string> };
      const win = {
        localStorage: { getItem: () => stored },
        matchMedia:
          systemLight == null ? undefined : () => ({ matches: systemLight }) as MediaQueryList,
      };
      new Function("window", "localStorage", "matchMedia", "document", THEME_BOOT)(
        win,
        win.localStorage,
        win.matchMedia,
        { documentElement: html },
      );
      return html.dataset.theme;
    };
    const saved = (theme: unknown) => JSON.stringify({ state: { theme }, version: 3 });
    for (const pref of ["system", ...THEMES, "neon", 42, undefined]) {
      for (const systemLight of [true, false, null]) {
        const want = resolveTheme(
          String(pref),
          systemLight == null ? null : !systemLight,
        ) satisfies Theme;
        expect({ pref, systemLight, got: run(saved(pref), systemLight) }).toEqual({
          pref,
          systemLight,
          got: want,
        });
      }
    }
    expect(run(null, true)).toBe("light");
    expect(run("not json", false)).toBeUndefined(); // broken storage: the CSS default (dark)
  });

  test("store: any palette can be set and backed up; unknown saved values become 'system'", () => {
    const s = useHabits.getState();
    s.setTheme("glitch");
    expect(JSON.parse(useHabits.getState().exportData()).theme).toBe("glitch");
    const merge = useHabits.persist.getOptions().merge!;
    expect(merge({ theme: "terminal" }, useHabits.getState()).theme).toBe("terminal");
    expect(merge({ theme: "neon" }, useHabits.getState()).theme).toBe("system");
    expect(merge({}, useHabits.getState()).theme).toBe("system");
    s.setTheme("system");
  });

  test("widget snapshot carries the resolved app theme", () => {
    useHabits.getState().setTheme("sakura");
    expect(themeFields()).toEqual({ theme: "sakura", themePref: "sakura", themeLight: true });
    useHabits.getState().setTheme("glitch");
    expect(themeFields()).toEqual({ theme: "glitch", themePref: "glitch", themeLight: false });
    useHabits.getState().setTheme("system");
    // no matchMedia under bun: like an unknown phone setting = dark
    expect(themeFields()).toEqual({ theme: "dark", themePref: "system", themeLight: false });
  });

  test("confetti follows the theme", () => {
    expect(confettiColors("glitch")).toContain("#ff2bd6");
    expect(confettiColors("dark")).toEqual(confettiColors(undefined));
    const pieces = makePieces(30, 400, Math.random, confettiColors("glitch"));
    expect(pieces.every((p) => confettiColors("glitch").includes(p.color))).toBe(true);
  });
});
