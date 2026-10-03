import { beforeEach, describe, expect, test } from "bun:test";
import vectors from "./calendar-vectors.json";
import {
  accountKind,
  avoidBusy,
  busyIntervals,
  busySummary,
  fitWindow,
  freeAfter,
  freeWindows,
  groupByAccount,
  jabAt,
  jabTimes,
  matchWindow,
  mergeIntervals,
  normalizeCalendarIds,
  toEvents,
  untilMinute,
  windowText,
  type Availability,
  type DeviceCalendar,
  type Interval,
} from "@/lib/calendar";
import { useHabits } from "@/lib/habits/store";
import { buildState } from "@/lib/widget/bridge";
import { planDay, type PlanItem } from "@/lib/habits/utils";
import { tauntSlots } from "@/lib/notifications";
import { setLang } from "@/lib/i18n";
import { habit } from "./helpers";

const AV: Availability[] = ["busy", "free", "tentative"];
const iv = (a: number[][]) => a as Interval[];

describe("shared vectors (CalendarMathTest.java checks the same file)", () => {
  test("merge", () => {
    for (const v of vectors.merge) expect(mergeIntervals(iv(v.list))).toEqual(iv(v.expected));
  });
  test("busy", () => {
    for (const v of vectors.busy) {
      const events = v.events.map((e) => ({ ...e, availability: AV[e.availability] }));
      expect(busyIntervals(events, { allDay: v.allDay, tentative: v.tentative })).toEqual(
        iv(v.expected),
      );
    }
  });
  test("freeAfter", () => {
    for (const v of vectors.free) expect(freeAfter(iv(v.busy), v.minute)).toBe(v.expected);
  });
  test("freeWindows", () => {
    for (const v of vectors.windows)
      expect(freeWindows(iv(v.busy), v.from, v.until, v.min)).toEqual(iv(v.expected));
  });
  test("jabAt", () => {
    for (const v of vectors.jab) expect(jabAt(v.slot, v.limit, iv(v.busy), v.now)).toBe(v.expected);
  });
  test("jabTimes", () => {
    for (const v of vectors.times)
      expect(jabTimes(v.slots, v.wake, v.bedtime, iv(v.busy), v.now)).toEqual(v.expected);
  });
  test("fit", () => {
    for (const v of vectors.fit)
      expect(fitWindow(iv(v.busy), v.now, v.until, v.needs)).toEqual(
        v.expected as [number, number, number] | null,
      );
  });
});

describe("busy intervals", () => {
  test("overlapping and touching meetings merge, FREE / declined / all-day are ignored", () => {
    const busy = busyIntervals([
      { start: 600, end: 660 },
      { start: 650, end: 700 },
      { start: 700, end: 730 }, // touching
      { start: 800, end: 860, availability: "free" },
      { start: 900, end: 960, declined: true },
      { start: 0, end: 1440, allDay: true },
    ]);
    expect(busy).toEqual([[600, 730]]);
  });

  test("all-day events can be opted in, tentative ones out", () => {
    const ev = [
      { start: 0, end: 1440, allDay: true },
      { start: 600, end: 630, availability: "tentative" as const },
    ];
    expect(busyIntervals(ev, { allDay: true })).toEqual([[0, 1440]]);
    expect(busyIntervals(ev, { tentative: false })).toEqual([]);
    expect(busyIntervals(ev)).toEqual([[600, 630]]);
  });

  test("freeAfter walks past back-to-back meetings", () => {
    const busy = mergeIntervals([
      [600, 660],
      [660, 720],
    ]);
    expect(freeAfter(busy, 610)).toBe(720);
    expect(freeAfter(busy, 720)).toBe(720);
  });

  test("free windows between meetings, clipped to bedtime", () => {
    const busy: Interval[] = [
      [600, 660],
      [1090, 1130],
      [1300, 1400],
    ];
    expect(freeWindows(busy, 1000, 1320, 30)).toEqual([
      [1000, 1090],
      [1130, 1300],
    ]);
    expect(freeWindows(busy, 1000, 1320, 100)).toEqual([[1130, 1300]]);
  });

  test("epoch instances become minutes from midnight (rounded outwards)", () => {
    const mid = new Date(2026, 9, 2).getTime();
    const ev = toEvents(
      [
        {
          begin: mid + 9 * 3600_000 + 30_000,
          end: mid + 10 * 3600_000 + 30_000,
          allDay: false,
          availability: 2,
          calendarId: "5",
          title: "Daily",
        },
        {
          begin: mid - 3600_000,
          end: mid + 1800_000,
          allDay: false,
          availability: 1,
          calendarId: "5",
        },
      ],
      mid,
    );
    expect(ev[0]).toMatchObject({
      start: 540,
      end: 601,
      availability: "tentative",
      title: "Daily",
    });
    expect(ev[1]).toMatchObject({ start: -60, end: 30, availability: "free" });
    expect(busySummary(busyIntervals(ev), 0, 1440)).toEqual({ count: 1, minutes: 61 });
  });

  test("bedtime after midnight is counted past 24:00", () => {
    expect(untilMinute(22 * 60, 9 * 60)).toBe(1320);
    expect(untilMinute(60, 9 * 60)).toBe(1500);
  });
});

describe("no jabs during meetings", () => {
  test("without meetings every slot keeps the old rule (latest slot < 60 min ago)", () => {
    for (const [wake, bed] of [
      [540, 1320],
      [600, 60],
    ])
      for (const n of [1, 5, 8]) {
        const slots = tauntSlots(n, wake, bed);
        for (let now = 0; now < 1440; now += 7) {
          const at = jabTimes(slots, wake, bed, [], now);
          let old = -1;
          for (const m of slots) if (m <= now && now - m <= 60) old = m;
          let got = -1;
          slots.forEach((m, i) => {
            if (at[i] >= 0 && at[i] <= now) got = m;
          });
          expect(got).toBe(old);
        }
      }
  });

  test("a slot inside a meeting moves to its end, or is dropped before the next slot", () => {
    const busy: Interval[] = [[540, 615]];
    expect(jabAt(570, 750, busy, 570)).toBe(615); // waits
    expect(jabAt(570, 750, busy, 615)).toBe(615); // fires
    expect(jabAt(570, 600, busy, 570)).toBe(-1); // the next slot is sooner - skip
  });
});

const minutes = (name: string, target: number) =>
  habit({ name, goal: { type: "minutes", target, step: 10 } });
const item = (h: ReturnType<typeof habit>, left: number, at = 600): PlanItem => ({
  habit: h,
  at,
  amount: 0,
  left,
  avoid: false,
  overdue: false,
  key: 0,
});

describe("free windows for minutes habits", () => {
  beforeEach(() => setLang("pl"));

  test("the next window that fits what's left wins (plan order inside a window)", () => {
    const code = minutes("Programuj", 30);
    const read = minutes("Czytanie", 20);
    const busy: Interval[] = [
      [900, 1090],
      [1130, 1200],
    ];
    const plan = [item(code, 60), item(read, 20)];
    // 18:10-18:50 is 40 min: coding needs 60, reading 20 fits
    expect(matchWindow(plan, busy, 1000, 1320)).toMatchObject({
      habit: read,
      need: 20,
      start: 1090,
      end: 1130,
    });
    const m = matchWindow([item(code, 30)], busy, 1000, 1320)!;
    expect(windowText(m, 1000)).toBe("Masz 18:10–18:50 wolne — idealne na 30 min: Programuj");
    setLang("en");
    expect(windowText(m, 1000)).toBe("You're free 18:10–18:50 — perfect for 30 min of Programuj");
    expect(windowText({ ...m, start: 1000 }, 1000)).toBe(
      "You're free until 18:50 — perfect for 30 min of Programuj",
    );
  });

  test("no meetings = no window hint; count/check/avoid habits are not matched", () => {
    const code = minutes("Programuj", 30);
    expect(matchWindow([item(code, 30)], [], 600, 1320)).toBeNull();
    const water = habit({ name: "Woda", goal: { type: "count", target: 8, step: 1 } });
    expect(matchWindow([item(water, 5)], [[700, 800]], 600, 1320)).toBeNull();
    expect(matchWindow([{ ...item(code, 30), avoid: true }], [[700, 800]], 600, 1320)).toBeNull();
  });

  test("a window must end before bedtime", () => {
    const code = minutes("Programuj", 30);
    expect(matchWindow([item(code, 30)], [[1200, 1300]], 1180, 1320)).toBeNull();
  });
});

describe("plan times out of meetings (Today only)", () => {
  test("a suggested time inside a meeting moves to its end; overdue items and order stay", () => {
    const a = minutes("A", 30);
    const b = minutes("B", 30);
    const c = minutes("C", 30);
    const plan = [item(a, 30, 500), item(b, 30, 620), item(c, 30, 700)];
    const out = avoidBusy(plan, [[600, 660]], 550);
    expect(out.map((p) => p.at)).toEqual([500, 660, 700]);
    expect(out.map((p) => p.habit.name)).toEqual(["A", "B", "C"]);
    expect(avoidBusy(plan, [], 550)).toEqual(plan);
  });

  test("planDay itself is untouched (native parity)", () => {
    const h = habit({
      name: "Programuj",
      goal: { type: "minutes", target: 30, step: 15 },
      reminder: "10:00",
    });
    const plan = planDay([h], [], new Date(2026, 9, 2, 8, 0));
    expect(plan[0].at).toBe(600);
  });
});

describe("accounts", () => {
  const cal = (p: Partial<DeviceCalendar>): DeviceCalendar => ({
    id: "1",
    name: "Kalendarz",
    accountName: "ja@gmail.com",
    accountType: "com.google",
    color: "#ff0000",
    visible: true,
    ...p,
  });

  test("calendars are grouped by account, work Outlook / Exchange recognised", () => {
    setLang("pl");
    const groups = groupByAccount([
      cal({ id: "1" }),
      cal({ id: "2", name: "Urodziny" }),
      cal({
        id: "3",
        accountName: "jan@firma.pl",
        accountType: "com.microsoft.office.outlook.USER_ACCOUNT",
      }),
      cal({ id: "4", accountName: "Telefon", accountType: "LOCAL" }),
    ]);
    expect(groups.map((g) => [g.title, g.kind, g.calendars.length])).toEqual([
      ["ja@gmail.com", "Google", 2],
      ["jan@firma.pl", "Outlook", 1],
      ["Telefon", "Na telefonie", 1],
    ]);
    expect(accountKind("com.google.android.gm.exchange")).toBe("Exchange");
    expect(accountKind("com.example.other")).toBe("com.example.other");
  });

  test("ids are de-duplicated and cleaned", () => {
    expect(normalizeCalendarIds(["1", "1", "", 3, "7"])).toEqual(["1", "7"]);
    expect(normalizeCalendarIds("x")).toEqual([]);
  });
});

describe("store, backup and snapshot", () => {
  beforeEach(() => {
    useHabits.setState({ habits: [], completions: [], seeded: true, calendars: [] });
  });

  test("picked calendars persist, round-trip through a backup and reach the snapshot", () => {
    const s = useHabits.getState();
    s.setCalendars(["12", "7", "12"]);
    expect(useHabits.getState().calendars).toEqual(["12", "7"]);
    const json = useHabits.getState().exportData();
    expect(JSON.parse(json).calendars).toEqual(["12", "7"]);
    useHabits.getState().setCalendars([]);
    useHabits.getState().importData(json);
    expect(useHabits.getState().calendars).toEqual(["12", "7"]);
    const snap = buildState();
    expect(snap.calendar).toEqual({ ids: ["12", "7"], quiet: true, windows: true });
  });

  test("an old backup without calendars keeps the current choice", () => {
    useHabits.getState().setCalendars(["3"]);
    const old = JSON.parse(useHabits.getState().exportData());
    delete old.calendars;
    useHabits.getState().importData(JSON.stringify(old));
    expect(useHabits.getState().calendars).toEqual(["3"]);
  });

  test("an old save gets the defaults (merge backfill)", () => {
    const merge = useHabits.persist.getOptions().merge!;
    const notifications = { ...useHabits.getState().notifications } as Record<string, unknown>;
    delete notifications.meetingQuiet;
    delete notifications.freeWindows;
    const merged = merge({ notifications }, useHabits.getState()) as ReturnType<
      typeof useHabits.getState
    >;
    expect(merged.calendars).toEqual([]);
    expect(merged.notifications.meetingQuiet).toBe(true);
    expect(merged.notifications.freeWindows).toBe(true);
  });
});
