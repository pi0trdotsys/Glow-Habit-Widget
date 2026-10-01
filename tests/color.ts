// Colour maths for the theme tests: oklch() / hex -> sRGB, WCAG contrast, and a tiny
// parser for the palettes in src/styles.css. No dependencies.
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type RGB = [number, number, number]; // 0..1, gamma-encoded sRGB

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** oklch(L C H) -> sRGB (clamped to the gamut). L may be 0..1 or a percentage. */
export function oklchToRgb(l: number, c: number, h: number): RGB {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const lin = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return lin.map((v) => {
    const x = clamp01(v);
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  }) as RGB;
}

export function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.replace(/./g, (x) => x + x) : h.slice(0, 6);
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255) as RGB;
}

export function rgbToHex([r, g, b]: RGB): string {
  return (
    "#" +
    [r, g, b]
      .map((v) =>
        Math.round(clamp01(v) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/** Parses "oklch(0.5 0.1 200)", "oklch(1 0 0 / 8%)" (alpha ignored) or "#rrggbb". */
export function parseColor(css: string): RGB {
  const s = css.trim();
  if (s.startsWith("#")) return hexToRgb(s);
  const m = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)/.exec(s);
  if (!m) throw new Error(`unsupported colour: ${css}`);
  const l = Number(m[1]) / (m[2] ? 100 : 1);
  return oklchToRgb(l, Number(m[3]), Number(m[4]));
}

export function luminance([r, g, b]: RGB): number {
  const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: string | RGB, b: string | RGB): number {
  const la = luminance(typeof a === "string" ? parseColor(a) : a);
  const lb = luminance(typeof b === "string" ? parseColor(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Max per-channel distance (0..255) between two colours. */
export function colorDistance(a: string, b: string): number {
  const x = parseColor(a);
  const y = parseColor(b);
  return Math.max(...x.map((v, i) => Math.abs(v - y[i]) * 255));
}

/**
 * The custom properties each palette block in styles.css declares, keyed by theme id
 * ("dark" = the :root block). Blocks are `:root, [data-theme="dark"] {` and
 * `[data-theme="<id>"] {`.
 */
export function cssPalettes(): Record<string, Record<string, string>> {
  const css = readFileSync(join(import.meta.dir, "..", "src", "styles.css"), "utf8");
  const out: Record<string, Record<string, string>> = {};
  const re = /(^|\n)([^\n{}]*\[data-theme="([a-z]+)"\][^\n{}]*)\{([^}]*)\}/g;
  for (const m of css.matchAll(re)) {
    const selector = m[2];
    // only the palette blocks themselves (no descendant rules like `[data-theme="glitch"] h1`)
    if (!/^\s*(:root,\s*)?\[data-theme="[a-z]+"\]\s*$/.test(selector)) continue;
    const vars: Record<string, string> = {};
    for (const d of m[4].matchAll(/(--[a-z0-9-]+|color-scheme)\s*:\s*([^;]+);/g))
      vars[d[1]] = d[2].trim();
    out[m[3]] = { ...(out[m[3]] ?? {}), ...vars };
  }
  return out;
}
