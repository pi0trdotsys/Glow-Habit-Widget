// Converts the lucide icons used by the app into Android vector drawables
// (stroke-based, white, tinted at runtime). Run: node scripts/lucide-to-android.mjs
import fs from "node:fs";
import path from "node:path";

// Keep in sync with HABIT_ICONS in src/lib/habits/colors.ts. "Tooth" is NOT
// here - it has no lucide source and ships as a hand-written ic_habit_tooth.xml.
const ICONS = [
  "Droplet", "Activity", "BookOpen", "Sparkles", "Apple", "Dumbbell",
  "Brain", "Footprints", "Bike", "Heart", "Moon", "Sun", "Coffee",
  "Leaf", "Music", "PenLine", "Phone", "Pill", "Smile", "Bed",
  // Added:
  "Droplets", "Bath", "Brush", "Hand", "HandHeart", "HeartPulse",
  "Stethoscope", "Waves", "Flame", "Trophy", "Target", "Star", "Zap",
  "Salad", "Carrot", "Egg", "Fish", "Cookie", "Utensils", "GlassWater",
  "CupSoda", "GraduationCap", "NotebookPen", "Languages", "Code", "Laptop",
  "Calculator", "Briefcase", "Wallet", "PiggyBank", "Camera", "Palette",
  "Guitar", "Headphones", "Film", "Gamepad2", "Sprout", "Flower2",
  "TreePine", "MountainSnow", "Sunrise", "Sunset", "CloudRain", "Wind",
  "Dog", "Recycle", "Shirt", "Scissors", "Glasses", "Feather", "Mic",
  // Loop 2.1: coding / languages and things people try to cut down on
  "Terminal", "Globe", "Smartphone", "BedDouble", "EyeOff", "UtensilsCrossed",
  "Hamburger", "Pizza", "Sandwich", "Candy", "Lollipop", "Donut", "IceCreamCone",
  "Beer", "Wine", "Martini", "Cigarette", "Dice5", "Coins", "ShoppingCart",
  "ShoppingBag", "CreditCard", "Tv", "Popcorn", "AlarmClockOff", "Hourglass",
  "MessageCircleX", "Ban",
];

const SRC = "node_modules/lucide-react/dist/esm/icons";
const OUT = "android/app/src/main/res/drawable";

// lucide source files: dash before an uppercase AND before a trailing digit
// (e.g. Gamepad2 -> gamepad-2.js, Flower2 -> flower-2.js).
const pascalToKebab = (s) =>
  s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([a-zA-Z])([0-9])/g, "$1-$2").toLowerCase();
// output drawable name must match WidgetShared.pascalToSnake (no separator
// before digits): Gamepad2 -> gamepad2, HeartPulse -> heart_pulse.
const pascalToSnake = (s) => s.replace(/([a-zA-Z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const num = (v) => (typeof v === "number" ? +v.toFixed(3) : v);

function nodeToPath([type, a]) {
  switch (type) {
    case "path":
      return a.d;
    case "line":
      return `M${a.x1} ${a.y1}L${a.x2} ${a.y2}`;
    case "circle": {
      const { cx, cy, r } = a;
      return `M${num(cx - r)} ${cy}a${r} ${r} 0 1 0 ${num(2 * r)} 0a${r} ${r} 0 1 0 ${num(-2 * r)} 0`;
    }
    case "ellipse": {
      const { cx, cy, rx, ry } = a;
      return `M${num(cx - rx)} ${cy}a${rx} ${ry} 0 1 0 ${num(2 * rx)} 0a${rx} ${ry} 0 1 0 ${num(-2 * rx)} 0`;
    }
    case "rect": {
      const x = +a.x, y = +a.y, w = +a.width, h = +a.height;
      const rx = a.rx != null ? +a.rx : 0;
      const ry = a.ry != null ? +a.ry : rx;
      if (!rx && !ry) return `M${x} ${y}h${w}v${h}h${-w}Z`;
      return `M${num(x + rx)} ${y}h${num(w - 2 * rx)}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${num(h - 2 * ry)}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${num(-(w - 2 * rx))}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${num(-(h - 2 * ry))}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
    }
    case "polyline":
    case "polygon": {
      const pts = a.points.trim().split(/\s+/);
      let d = "M" + pts[0] + pts.slice(1).map((p) => "L" + p).join("");
      if (type === "polygon") d += "Z";
      return d;
    }
    default:
      return null;
  }
}

function extractNodes(js) {
  const m = js.match(/const __iconNode = (\[[\s\S]*?\]);\nconst/);
  if (!m) throw new Error("no __iconNode");
  // The array literal uses unquoted object keys → eval in a sandboxed function.
  return Function(`"use strict";return (${m[1]})`)();
}

fs.mkdirSync(OUT, { recursive: true });
let count = 0;
for (const name of ICONS) {
  const file = path.join(SRC, pascalToKebab(name) + ".js");
  const nodes = extractNodes(fs.readFileSync(file, "utf8"));
  const paths = nodes
    .map(nodeToPath)
    .filter(Boolean)
    .map(
      (d) =>
        `    <path android:pathData="${d}" android:strokeColor="#FFFFFFFF" android:strokeWidth="2" android:strokeLineCap="round" android:strokeLineJoin="round" />`,
    )
    .join("\n");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
${paths}
</vector>
`;
  const snake = pascalToSnake(name);
  fs.writeFileSync(path.join(OUT, `ic_habit_${snake}.xml`), xml);
  count++;
}
console.log(`Generated ${count} icon drawables in ${OUT}`);
