// Regenerates tests/calendar-vectors.json from the TypeScript implementation
// (src/lib/calendar.ts). The Java side (CalendarMathTest) must produce identical
// results; tests/calendar.test.ts checks the TS side by hand as well.
// Run: bun tests/gen-calendar-vectors.ts && prettier --write tests/calendar-vectors.json
import { writeFileSync } from "node:fs";
import {
  busyIntervals,
  fitWindow,
  freeAfter,
  freeWindows,
  jabAt,
  jabTimes,
  mergeIntervals,
  type Availability,
  type Interval,
} from "@/lib/calendar";
import { tauntSlots } from "@/lib/notifications";

const lists: Interval[][] = [
  [],
  [[600, 660]],
  [
    [600, 660],
    [630, 700],
  ],
  [
    [600, 660],
    [660, 720],
  ], // touching
  [
    [900, 960],
    [600, 660],
    [610, 620],
  ],
  [
    [700, 700],
    [800, 790],
    [480, 540],
  ], // empty / reversed dropped
  [
    [-60, 30],
    [1380, 1500],
  ], // across midnight
];
const merge = lists.map((list) => ({ list, expected: mergeIntervals(list) }));

const AV: Record<Availability, number> = { busy: 0, free: 1, tentative: 2 };
const evs = [
  { start: 540, end: 600, allDay: false, availability: "busy" as Availability, declined: false },
  {
    start: 570,
    end: 630,
    allDay: false,
    availability: "tentative" as Availability,
    declined: false,
  },
  { start: 700, end: 760, allDay: false, availability: "free" as Availability, declined: false },
  { start: 800, end: 860, allDay: false, availability: "busy" as Availability, declined: true },
  { start: 0, end: 1440, allDay: true, availability: "busy" as Availability, declined: false },
  { start: 1000, end: 1030, allDay: false, availability: "busy" as Availability, declined: false },
];
const busy = [];
for (const allDay of [false, true])
  for (const tentative of [true, false])
    busy.push({
      events: evs.map((e) => ({ ...e, availability: AV[e.availability] })),
      allDay,
      tentative,
      expected: busyIntervals(evs, { allDay, tentative }),
    });

const day: Interval[] = [
  [540, 600],
  [600, 660],
  [720, 780],
  [1080, 1110],
];
const merged = mergeIntervals(day);
const free = [];
for (const minute of [500, 540, 599, 600, 659, 660, 700, 750, 1100, 1200])
  free.push({ busy: merged, minute, expected: freeAfter(merged, minute) });

const windows = [];
for (const [from, until, min] of [
  [480, 1320, 1],
  [480, 1320, 30],
  [480, 1320, 60],
  [600, 1320, 30],
  [800, 1000, 30],
  [1100, 1320, 120],
  [700, 720, 10],
])
  windows.push({ busy: merged, from, until, min, expected: freeWindows(merged, from, until, min) });

const jab = [];
for (const [slot, limit] of [
  [570, 750],
  [690, 750],
  [750, 900],
  [1090, 1100],
  [1090, 1200],
])
  for (const now of [560, 570, 640, 660, 700, 770, 780, 790, 850, 1095, 1110, 1150, 1180])
    jab.push({ busy: merged, slot, limit, now, expected: jabAt(slot, limit, merged, now) });

const times = [];
for (const [wake, bedtime, n] of [
  [540, 1320, 5],
  [420, 1380, 8],
  [600, 60, 5],
])
  for (const now of [570, 700, 780, 1100, 1200, 30]) {
    const slots = tauntSlots(n, wake, bedtime);
    times.push({
      slots,
      wake,
      bedtime,
      busy: merged,
      now,
      expected: jabTimes(slots, wake, bedtime, merged, now),
    });
    times.push({
      slots,
      wake,
      bedtime,
      busy: [],
      now,
      expected: jabTimes(slots, wake, bedtime, [], now),
    });
  }

const fit = [];
for (const [now, until] of [
  [480, 1320],
  [610, 1320],
  [790, 1320],
  [1100, 1320],
  [1200, 1320],
])
  for (const needs of [[30], [90], [30, 15], [200, 45], [600], [0], []])
    fit.push({ busy: merged, now, until, needs, expected: fitWindow(merged, now, until, needs) });
fit.push({
  busy: [],
  now: 600,
  until: 1320,
  needs: [30],
  expected: fitWindow([], 600, 1320, [30]),
});

writeFileSync(
  new URL("./calendar-vectors.json", import.meta.url),
  JSON.stringify({ merge, busy, free, windows, jab, times, fit }) + "\n",
);
console.log(
  `merge ${merge.length}, busy ${busy.length}, free ${free.length}, windows ${windows.length}, jab ${jab.length}, times ${times.length}, fit ${fit.length}`,
);
