import type { HabitColor } from "./types";

export const HABIT_COLOR_VAR: Record<HabitColor, string> = {
  mint: "var(--habit-mint)",
  coral: "var(--habit-coral)",
  amber: "var(--habit-amber)",
  violet: "var(--habit-violet)",
  sky: "var(--habit-sky)",
  rose: "var(--habit-rose)",
  lime: "var(--habit-lime)",
  sand: "var(--habit-sand)",
};

export const HABIT_COLORS: HabitColor[] = [
  "mint",
  "coral",
  "amber",
  "violet",
  "sky",
  "rose",
  "lime",
  "sand",
];

// Icon names. Most are lucide-react icon names; "Tooth" is a custom icon
// rendered by HabitIcon (lucide has no dental glyph). When you add an icon
// here, also add it to scripts/lucide-to-android.mjs (or ship a custom
// ic_habit_*.xml drawable) so the native widget can render it.
export const HABIT_ICONS = [
  // Hygiene & health
  "Sparkles",
  "Tooth",
  "Droplet",
  "Droplets",
  "Bath",
  "Brush",
  "Hand",
  "HandHeart",
  "Heart",
  "HeartPulse",
  "Stethoscope",
  "Pill",
  // Fitness
  "Activity",
  "Dumbbell",
  "Bike",
  "Footprints",
  "Waves",
  "Flame",
  "Trophy",
  "Target",
  "Star",
  "Zap",
  // Food & drink
  "Apple",
  "Salad",
  "Carrot",
  "Egg",
  "Fish",
  "Cookie",
  "Utensils",
  "Coffee",
  "GlassWater",
  "CupSoda",
  // Mind & learning
  "Brain",
  "BookOpen",
  "GraduationCap",
  "NotebookPen",
  "PenLine",
  "Languages",
  // Work & money
  "Code",
  "Laptop",
  "Calculator",
  "Briefcase",
  "Wallet",
  "PiggyBank",
  // Creative & leisure
  "Camera",
  "Palette",
  "Guitar",
  "Music",
  "Headphones",
  "Film",
  "Gamepad2",
  // Nature & outdoors
  "Leaf",
  "Sprout",
  "Flower2",
  "TreePine",
  "MountainSnow",
  "Sun",
  "Sunrise",
  "Sunset",
  "Moon",
  "CloudRain",
  "Wind",
  "Dog",
  // Lifestyle
  "Recycle",
  "Shirt",
  "Scissors",
  "Glasses",
  "Feather",
  "Mic",
  "Phone",
  "Smile",
  "Bed",
] as const;

export type HabitIconName = (typeof HABIT_ICONS)[number];
/** Red accent for forbidden ("avoid") habits. */
export const AVOID_COLOR = "var(--avoid)";
