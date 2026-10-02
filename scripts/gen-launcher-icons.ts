// Launcher icons per app theme (the icon follows the theme, see AppIcon.java).
// Source: the current icon foreground (res/drawable/ic_launcher_foreground.xml - the cat from
// SzpilaAvatar in src/components/Szpila.tsx); "dark" IS that icon and is left untouched.
// For every other theme this writes:
//   res/drawable/ic_launcher_background_<t>.xml, res/drawable/ic_launcher_foreground_<t>.xml
//   res/mipmap-anydpi-v26/ic_launcher_<t>.xml + _round.xml   (adaptive, monochrome layer kept)
//   res/mipmap/ic_launcher_<t>.xml + _round.xml              (API 24-25: one clipped vector)
// Run: bun scripts/gen-launcher-icons.ts [--preview <dir>]   (--preview also writes SVGs + an
// HTML sheet of every icon in circle / squircle masks, to screenshot with a headless browser)
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "../src/lib/theme";

const RES = join(import.meta.dir, "..", "android", "app", "src", "main", "res");

// ------------------------------------------------------------------ model

type Stop = [offset: number, color: string];
type Gradient =
  | { type: "radial"; cx: number; cy: number; r: number; stops: Stop[] }
  | { type: "linear"; x1: number; y1: number; x2: number; y2: number; stops: Stop[] };
interface PathNode {
  kind: "path";
  d: string;
  fill?: string;
  fillAlpha?: number;
  grad?: Gradient;
  stroke?: string;
  strokeWidth?: number;
  strokeAlpha?: number;
  cap?: string;
  join?: string;
}
interface GroupNode {
  kind: "group";
  tx?: number;
  ty?: number;
  scale?: number;
  clip?: string;
  children: Node[];
}
type Node = PathNode | GroupNode;

const path = (d: string, p: Omit<PathNode, "kind" | "d"> = {}): PathNode => ({
  kind: "path",
  d,
  ...p,
});
const group = (children: Node[], p: Omit<GroupNode, "kind" | "children"> = {}): GroupNode => ({
  kind: "group",
  children,
  ...p,
});
const rect = (x: number, y: number, w: number, h: number) => `M${x},${y} h${w} v${h} h${-w} Z`;
const FULL = rect(0, 0, 108, 108);
/** #RRGGBB -> #FFRRGGBB (Android colours keep their alpha byte). */
const argb = (hex: string) => (hex.length === 7 ? "#FF" + hex.slice(1) : hex).toUpperCase();

// ------------------------------------------------------------------ source (the dark icon)

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/android:(\w+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

const SRC = readFileSync(join(RES, "drawable", "ic_launcher_foreground.xml"), "utf8");
const srcGroup = attrs(SRC.match(/<group[^>]*>/)![0]);
const CAT = {
  tx: Number(srcGroup.translateX),
  ty: Number(srcGroup.translateY),
  scale: Number(srcGroup.scaleX),
};
/** The cat's paths, in the source's own coordinates (64x64 avatar space). */
const SOURCE: PathNode[] = [...SRC.matchAll(/<path\b[^>]*\/>/g)].map((m) => {
  const a = attrs(m[0]);
  return path(a.pathData, {
    fill: a.fillColor,
    fillAlpha: a.fillAlpha ? Number(a.fillAlpha) : undefined,
    stroke: a.strokeColor,
    strokeWidth: a.strokeWidth ? Number(a.strokeWidth) : undefined,
    cap: a.strokeLineCap,
    join: a.strokeLineJoin,
  });
});

// Roles by the source colours.
const BODY = "#FF262633";
const LINE = "#FF3B3B4D";
const INK = "#FF111111";
/** Ears + head: the silhouette (glitch copies, outlines). */
const SILHOUETTE = SOURCE.filter((p) => p.fill === BODY);
if (SILHOUETTE.length !== 3)
  throw new Error(`expected 3 silhouette paths, got ${SILHOUETTE.length}`);

// ------------------------------------------------------------------ theme styles

interface Style {
  /** Background layers (108x108 viewport). */
  bg: Node[];
  /** Source colour -> theme colour, for fills / strokes. */
  fill?: Record<string, string>;
  stroke?: Record<string, string>;
  /** Silhouette outlines behind the cat, widest first: [colour, stroke width, alpha]. */
  halo?: [string, number, number?][];
  glitch?: boolean;
}

const radial = (cx: number, cy: number, r: number, ...stops: Stop[]): Gradient => ({
  type: "radial",
  cx,
  cy,
  r,
  stops: stops.map(([o, c]) => [o, argb(c)]),
});
const fillBg = (grad: Gradient) => path(FULL, { grad });
const solidBg = (c: string) => path(FULL, { fill: argb(c) });

const MAGENTA = "#FF2BD6";
const CYAN = "#14F0FF";

/** Glitch Pixel background: black with magenta / cyan tear bars and pixels (like .app-bg). */
const glitchBars: Node[] = [
  [MAGENTA, 15, 27, 20, 1.6],
  [CYAN, 76, 31, 16, 2],
  [CYAN, 13, 64, 12, 1.6],
  [MAGENTA, 72, 82, 22, 1.6],
  [MAGENTA, 27, 86, 3.2, 3.2],
  [CYAN, 66, 19, 3.2, 3.2],
  [CYAN, 86, 70, 2.4, 2.4],
].map(([c, x, y, w, h]) => path(rect(+x, +y, +w, +h), { fill: argb(String(c)) }));

/** Terminal: scanlines over the phosphor glow. */
const scanlines = path(Array.from({ length: 36 }, (_, i) => rect(0, i * 3, 108, 1)).join(" "), {
  fill: argb("#62F870"),
  fillAlpha: 0.07,
});

/** Sakura: a few petals around the cat (mostly in the margin a mask may cut). */
const petal = (x: number, y: number, rot: number, s: number) => {
  const r = (rot * Math.PI) / 180;
  const pt = (px: number, py: number) => {
    const X = x + (px * Math.cos(r) - py * Math.sin(r)) * s;
    const Y = y + (px * Math.sin(r) + py * Math.cos(r)) * s;
    return `${X.toFixed(2)},${Y.toFixed(2)}`;
  };
  return `M${pt(0, -4)} Q${pt(3.2, -1)} ${pt(0, 4)} Q${pt(-3.2, -1)} ${pt(0, -4)} Z`;
};
const petals: Node[] = [
  path([petal(27, 27, -30, 1.1), petal(83, 76, 40, 1.2), petal(24, 80, 70, 0.9)].join(" "), {
    fill: argb("#F08DB6"),
    fillAlpha: 0.55,
  }),
  path([petal(84, 30, 15, 0.9), petal(76, 88, -20, 0.7)].join(" "), {
    fill: argb("#E86A9E"),
    fillAlpha: 0.4,
  }),
];

/** Ocean: two soft waves under the cat. */
const waves: Node[] = [80, 86.5].map((y, i) =>
  path(`M10,${y} q6,-3 12,0 t12,0 t12,0 t12,0 t12,0 t12,0 t12,0 t12,0`, {
    stroke: argb("#51DFDF"),
    strokeWidth: 1.6,
    strokeAlpha: i ? 0.18 : 0.3,
    cap: "round",
  }),
);

/** Terminal phosphor greens for every colourful part (habit colours turn green there too). */
const PHOSPHOR = "#FF62F870";

const STYLES: Record<string, Style> = {
  dark: { bg: [] }, // the current icon (not generated)
  light: {
    bg: [fillBg(radial(38, 30, 100, [0, "#FFFFFF"], [1, "#DCDFE7"]))],
    // the original dark cat reads on white; a red rim keeps the Szpila red
    halo: [["#D70E3A", 3.4]],
  },
  amoled: {
    bg: [solidBg("#000000")],
    fill: { [BODY]: "#FF15151C" },
    stroke: { [LINE]: "#FF2E2E3B" },
    halo: [["#FF4A63", 3.4]],
  },
  glitch: {
    bg: [solidBg("#000000"), ...glitchBars],
    fill: {
      [BODY]: "#FF000000",
      "#FFC6F35E": argb(CYAN),
      "#FFFF7D9C": argb(MAGENTA),
    },
    stroke: { [LINE]: "#FFFFFFFF", [INK]: "#FFFFFFFF", "#FF6B6B80": "#FFC8C8D2" },
    halo: [["#FFFFFF", 3.2]],
    glitch: true,
  },
  terminal: {
    bg: [fillBg(radial(54, 46, 72, [0, "#0B3412"], [1, "#020A03"])), scanlines],
    fill: {
      [BODY]: "#FF041207",
      "#FFFF7D9C": PHOSPHOR,
      "#FFC6F35E": "#FF7CFF85",
      [INK]: "#FF020A03",
      "#FF1A0A0E": "#FF020A03",
      "#FFD9DDE5": "#FF9DFFA3",
      "#FFF1F3F7": "#FFC9FFCD",
      "#FFFFFFFF": "#FFE6FFE8",
    },
    stroke: {
      [LINE]: PHOSPHOR,
      [INK]: PHOSPHOR,
      "#FF6B6B80": "#FF74C878",
      "#FFD9DDE5": "#FF9DFFA3",
      "#FF8E95A3": "#FF2E8A36",
    },
    halo: [
      ["#62F870", 8, 0.16],
      ["#62F870", 3.2],
    ],
  },
  ocean: {
    bg: [fillBg(radial(38, 28, 100, [0, "#1F86A6"], [0.55, "#0A3A55"], [1, "#021624"])), ...waves],
    fill: { [BODY]: "#FF0B1C2A" },
    stroke: { [LINE]: "#FF1F3B50", "#FF6B6B80": "#FF7FA6B8" },
    halo: [["#51DFDF", 3.2]],
  },
  sunset: {
    bg: [
      path(FULL, {
        grad: {
          type: "linear",
          x1: 30,
          y1: 0,
          x2: 78,
          y2: 108,
          stops: [
            [0, argb("#FFC069")],
            [0.5, argb("#FF6F7E")],
            [1, argb("#7A2557")],
          ],
        },
      }),
    ],
    fill: { [BODY]: "#FF2E172C" },
    stroke: { [LINE]: "#FF4A2A45", "#FF6B6B80": "#FF3A1C36" },
  },
  sakura: {
    bg: [fillBg(radial(38, 30, 100, [0, "#FFFFFF"], [1, "#F6D2E2"])), ...petals],
    fill: { [BODY]: "#FF3A2131", "#FFFF7D9C": "#FFF48FB8" },
    stroke: { [LINE]: "#FF5E3A4F", "#FF6B6B80": "#FF8E6A7C" },
  },
};

// ------------------------------------------------------------------ building the layers

function recolor(p: PathNode, s: Style): PathNode {
  return {
    ...p,
    fill: p.fill && (s.fill?.[p.fill] ?? p.fill),
    stroke: p.stroke && (s.stroke?.[p.stroke] ?? p.stroke),
  };
}

/** The silhouette as one flat colour with a stroke of `width` (outlines, glitch copies). */
function silhouette(color: string, width: number, alpha?: number): Node[] {
  return SILHOUETTE.map((p) =>
    path(p.d, {
      fill: argb(color),
      fillAlpha: alpha,
      stroke: argb(color),
      strokeWidth: width,
      strokeAlpha: alpha,
      join: "round",
    }),
  );
}

/** The cat in its theme (in avatar coordinates), outlines and glitch copies included. */
function catLayers(s: Style): Node[] {
  const out: Node[] = [];
  if (s.glitch) {
    out.push(group(silhouette(MAGENTA, 1.5), { tx: -2.6 }));
    out.push(group(silhouette(CYAN, 1.5), { tx: 2.6 }));
  }
  for (const [c, w, a] of s.halo ?? []) out.push(...silhouette(c, w, a));
  out.push(...SOURCE.map((p) => recolor(p, s)));
  return out;
}

function foreground(s: Style): Node[] {
  const cat = catLayers(s);
  const layers: Node[] = [group(cat, CAT)];
  if (s.glitch) {
    // Tear band: a slice through the eyes, shifted right, with a magenta / cyan edge.
    const y = 32.2;
    const h = 4.6;
    layers.push(
      group(
        [
          group(
            [
              path(rect(-8, y, 80, h), { fill: "#FF000000" }),
              group(cat, { tx: 4.2 }),
              path(rect(-8, y, 80, 0.7), { fill: argb(MAGENTA) }),
              path(rect(-8, y + h - 0.7, 80, 0.7), { fill: argb(CYAN) }),
            ],
            { clip: rect(-2, y, 70, h) },
          ),
        ],
        CAT,
      ),
    );
  }
  return layers;
}

// ------------------------------------------------------------------ Android vector XML

const n = (v: number) => String(+v.toFixed(3));

function gradientXml(g: Gradient, ind: string): string {
  const head =
    g.type === "radial"
      ? `type="radial" android:centerX="${n(g.cx)}" android:centerY="${n(g.cy)}" android:gradientRadius="${n(g.r)}"`
      : `type="linear" android:startX="${n(g.x1)}" android:startY="${n(g.y1)}" android:endX="${n(g.x2)}" android:endY="${n(g.y2)}"`;
  const items = g.stops
    .map(([o, c]) => `${ind}            <item android:offset="${n(o)}" android:color="${c}" />`)
    .join("\n");
  return [
    `${ind}    <aapt:attr name="android:fillColor">`,
    `${ind}        <gradient android:${head}>`,
    items,
    `${ind}        </gradient>`,
    `${ind}    </aapt:attr>`,
  ].join("\n");
}

function nodeXml(node: Node, ind: string): string {
  if (node.kind === "group") {
    const a: string[] = [];
    if (node.tx) a.push(`android:translateX="${n(node.tx)}"`);
    if (node.ty) a.push(`android:translateY="${n(node.ty)}"`);
    if (node.scale && node.scale !== 1)
      a.push(`android:scaleX="${n(node.scale)}" android:scaleY="${n(node.scale)}"`);
    const kids = node.children.map((c) => nodeXml(c, ind + "    "));
    if (node.clip) kids.unshift(`${ind}    <clip-path android:pathData="${node.clip}" />`);
    return [`${ind}<group${a.length ? " " + a.join(" ") : ""}>`, ...kids, `${ind}</group>`].join(
      "\n",
    );
  }
  const a = [`android:pathData="${node.d}"`];
  if (node.fill) a.push(`android:fillColor="${node.fill}"`);
  if (node.fillAlpha != null) a.push(`android:fillAlpha="${n(node.fillAlpha)}"`);
  if (node.stroke) {
    a.push(
      `android:strokeColor="${node.stroke}"`,
      `android:strokeWidth="${n(node.strokeWidth ?? 1)}"`,
    );
    if (node.strokeAlpha != null) a.push(`android:strokeAlpha="${n(node.strokeAlpha)}"`);
    if (node.cap) a.push(`android:strokeLineCap="${node.cap}"`);
    if (node.join) a.push(`android:strokeLineJoin="${node.join}"`);
  }
  if (!node.grad) return `${ind}<path ${a.join(" ")} />`;
  return [`${ind}<path ${a.join(" ")}>`, gradientXml(node.grad, ind), `${ind}</path>`].join("\n");
}

const usesGradient = (nodes: Node[]): boolean =>
  nodes.some((x) => (x.kind === "group" ? usesGradient(x.children) : !!x.grad));

function vectorXml(comment: string, nodes: Node[], size = 108, viewport = 108): string {
  const aapt = usesGradient(nodes) ? '\n    xmlns:aapt="http://schemas.android.com/aapt"' : "";
  return [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<!-- ${comment} Generated by scripts/gen-launcher-icons.ts - do not edit. -->`,
    `<vector xmlns:android="http://schemas.android.com/apk/res/android"${aapt}`,
    `    android:width="${size}dp" android:height="${size}dp"`,
    `    android:viewportWidth="${viewport}" android:viewportHeight="${viewport}">`,
    ...nodes.map((x) => nodeXml(x, "    ")),
    `</vector>`,
    ``,
  ].join("\n");
}

const adaptiveXml = (t: string) =>
  [
    `<?xml version="1.0" encoding="utf-8"?>`,
    `<!-- "${t}" theme launcher icon. Generated by scripts/gen-launcher-icons.ts - do not edit. -->`,
    `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">`,
    `    <background android:drawable="@drawable/ic_launcher_background_${t}" />`,
    `    <foreground android:drawable="@drawable/ic_launcher_foreground_${t}" />`,
    `    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />`,
    `</adaptive-icon>`,
    ``,
  ].join("\n");

/** API 24-25 (no adaptive icons): background + cat in one vector, the visible 72dp centre
 *  clipped to a rounded square / circle like a classic launcher icon. */
function legacyNodes(s: Style, round: boolean): Node[] {
  const clip = round
    ? "M18,54 a36,36 0 1,0 72,0 a36,36 0 1,0 -72,0 Z"
    : "M30,18 H78 A12,12 0 0 1 90,30 V78 A12,12 0 0 1 78,90 H30 A12,12 0 0 1 18,78 V30 A12,12 0 0 1 30,18 Z";
  return [group([...s.bg, ...foreground(s)], { tx: -16, ty: -16, clip })];
}

// ------------------------------------------------------------------ SVG (previews)

let gradId = 0;
/** An Android #AARRGGBB colour (+ alpha attribute) as SVG paint attributes. */
function paint(attr: "fill" | "stroke", c: string, alpha = 1): string {
  const a = (parseInt(c.slice(1, 3), 16) / 255) * alpha;
  return `${attr}="#${c.slice(3)}"` + (a < 1 ? ` ${attr}-opacity="${n(a)}"` : "");
}
function nodeSvg(node: Node, defs: string[]): string {
  if (node.kind === "group") {
    const tf: string[] = [];
    if (node.tx || node.ty) tf.push(`translate(${n(node.tx ?? 0)} ${n(node.ty ?? 0)})`);
    if (node.scale && node.scale !== 1) tf.push(`scale(${n(node.scale)})`);
    let clip = "";
    if (node.clip) {
      const id = `c${gradId++}`;
      defs.push(`<clipPath id="${id}"><path d="${node.clip}"/></clipPath>`);
      clip = ` clip-path="url(#${id})"`;
    }
    const inner = node.children.map((c) => nodeSvg(c, defs)).join("");
    // clip in the group's own coordinates (as Android does): inner <g> carries the clip
    return `<g${tf.length ? ` transform="${tf.join(" ")}"` : ""}><g${clip}>${inner}</g></g>`;
  }
  let fill = `fill="none"`;
  if (node.grad) {
    const id = `g${gradId++}`;
    const g = node.grad;
    const stops = g.stops
      .map(([o, c]) => `<stop offset="${o}" stop-color="#${c.slice(3)}"/>`)
      .join("");
    defs.push(
      g.type === "radial"
        ? `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${g.cx}" cy="${g.cy}" r="${g.r}">${stops}</radialGradient>`
        : `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}">${stops}</linearGradient>`,
    );
    fill = `fill="url(#${id})"`;
  } else if (node.fill) {
    fill = paint("fill", node.fill, node.fillAlpha);
  }
  let stroke = "";
  if (node.stroke) {
    stroke =
      " " +
      paint("stroke", node.stroke, node.strokeAlpha) +
      ` stroke-width="${node.strokeWidth ?? 1}"` +
      (node.cap ? ` stroke-linecap="${node.cap}"` : "") +
      (node.join ? ` stroke-linejoin="${node.join}"` : "");
  }
  return `<path d="${node.d}" ${fill}${stroke}/>`;
}
function svg(nodes: Node[], viewBox: string, size: number): string {
  const defs: string[] = [];
  const body = nodes.map((x) => nodeSvg(x, defs)).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}"><defs>${defs.join("")}</defs>${body}</svg>`;
}

// ------------------------------------------------------------------ main

const previewDir = process.argv.includes("--preview")
  ? process.argv[process.argv.indexOf("--preview") + 1]
  : null;

const write = (rel: string[], text: string) => {
  mkdirSync(join(RES, ...rel.slice(0, -1)), { recursive: true });
  writeFileSync(join(RES, ...rel), text);
};

const DARK_BG: Node[] = [
  fillBg(radial(38, 30, 100, [0, "#F0354B"], [1, "#A8132A"])), // = ic_launcher_background.xml
];
const sheet: string[] = [];
for (const t of THEMES) {
  const s = STYLES[t];
  if (!s) throw new Error(`no launcher icon style for theme "${t}"`);
  const bg = t === "dark" ? DARK_BG : s.bg;
  const fg = t === "dark" ? [group(SOURCE, CAT)] : foreground(s);
  if (t !== "dark") {
    write(
      ["drawable", `ic_launcher_background_${t}.xml`],
      vectorXml(`"${t}" icon background.`, bg),
    );
    write(
      ["drawable", `ic_launcher_foreground_${t}.xml`],
      vectorXml(`"${t}" icon foreground: the Szpila cat in the theme's colours.`, fg),
    );
    write(["mipmap-anydpi-v26", `ic_launcher_${t}.xml`], adaptiveXml(t));
    write(["mipmap-anydpi-v26", `ic_launcher_${t}_round.xml`], adaptiveXml(t));
    for (const round of [false, true])
      write(
        ["mipmap", `ic_launcher_${t}${round ? "_round" : ""}.xml`],
        vectorXml(
          `"${t}" launcher icon for API 24-25 (no adaptive icons).`,
          legacyNodes(s, round),
          48,
          76,
        ),
      );
  }
  if (previewDir) {
    const all = [...bg, ...fg];
    const icon = (size: number) => svg(all, "18 18 72 72", size);
    writeFileSync(join(previewDir, `ic_launcher_${t}.svg`), svg(all, "0 0 108 108", 432));
    const legacy = t === "dark" ? "" : svg(legacyNodes(s, false), "0 0 76 76", 96);
    sheet.push(
      `<div class="t"><b>${t}</b><div class="row">` +
        `<span class="circle">${icon(144)}</span><span class="squircle">${icon(144)}</span>` +
        `<span class="circle">${icon(48)}</span><span class="raw">${svg(all, "0 0 108 108", 144)}</span>` +
        `${legacy}</div></div>`,
    );
  }
}
if (previewDir) {
  writeFileSync(
    join(previewDir, "preview.html"),
    `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:16px;font:14px sans-serif;background:#7a7f8c;color:#fff;display:grid;grid-template-columns:repeat(2,1fr);gap:14px;width:1400px}
.row{display:flex;gap:12px;align-items:center;margin-top:6px}
.circle svg{border-radius:50%;display:block}.squircle svg{border-radius:32%;display:block}.raw svg{display:block;outline:1px dashed #fff8}
</style>${sheet.join("")}`,
  );
  console.log(`previews in ${previewDir}`);
}
console.log(`launcher icons: ${THEMES.filter((t) => t !== "dark").length} themes written`);
