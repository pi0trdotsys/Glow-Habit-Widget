// Regenerates tests/planner-vectors.json from the TypeScript implementation.
// The Java side (PlannerParityTest) must produce identical results.
// Run: bun tests/gen-vectors.ts
import { writeFileSync } from "node:fs";
import { nextUnitMinute, rankKey } from "@/lib/habits/utils";
import { tauntSlots } from "@/lib/notifications";
import { escalationTier } from "@/lib/habits/szpila";

const windows = [
  { start: 480, end: 1200 }, // water 8:00-20:00
  { start: 450, end: 1290 }, // teeth 7:30-21:30
  { start: 540, end: 1200 }, // steps 9:00-20:00
  { start: 1260, end: 1260 }, // single shot 21:00
];
const nextUnit = [];
for (const w of windows)
  for (const units of [1, 2, 8])
    for (const done of [0, 1, 3, 7])
      for (const now of [300, 600, 845, 1000, 1300])
        nextUnit.push({ ...w, units, done, now, expected: nextUnitMinute(w, units, done, now) });

const rank = [];
for (const due of [450, 720, 1260])
  for (const now of [300, 700, 725, 1000, 1439])
    for (const avoid of [false, true])
      for (const multi of [false, true])
        rank.push({ due, now, avoid, multi, expected: rankKey(due, now, avoid, multi) });

const slots = [];
for (const [wake, bedtime] of [[540, 1320], [420, 1380], [600, 60], [480, 480]])
  for (const n of [1, 3, 5, 8]) slots.push({ n, wake, bedtime, expected: tauntSlots(n, wake, bedtime) });

const tier = [];
for (const overdue of [-30, 0, 179, 180, 400]) for (const jabs of [0, 2, 3]) tier.push({ overdue, jabs, expected: escalationTier(overdue, jabs) });

writeFileSync(
  new URL("./planner-vectors.json", import.meta.url),
  JSON.stringify({ nextUnit, rank, slots, tier }, null, 1) + "\n",
);
console.log(`nextUnit ${nextUnit.length}, rank ${rank.length}, slots ${slots.length}, tier ${tier.length}`);
