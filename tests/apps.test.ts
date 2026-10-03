import { beforeEach, describe, expect, test } from "bun:test";
import { addDays } from "date-fns";
import {
  adjustmentOf,
  appKindOf,
  appLabel,
  appShift,
  appUpdates,
  appsFloor,
  appsList,
  breakdown,
  isAppsHabit,
  suggestedApps,
  unlinkedAppHabits,
  type AppDay,
} from "@/lib/apps";
import { useHabits } from "@/lib/habits/store";
import { amountOn, todayKey } from "@/lib/habits/utils";
import { currentStreak } from "@/lib/habits/utils";
import { applyPendingOps, buildState } from "@/lib/widget/bridge";
import { setLang } from "@/lib/i18n";
import type { Completion, Habit } from "@/lib/habits/types";
import { entry, habit, key } from "./helpers";

const DUO = "com.duolingo";
const BUSUU = "com.busuu.android.enc";
const today = new Date();
const T = todayKey(today);

const lang = (p: Partial<Habit> = {}) =>
  habit(
    {
      name: "Ucz się języka obcego",
      icon: "Languages",
      color: "coral",
      goal: { type: "minutes", target: 15, step: 5 },
      source: "apps",
      apps: [DUO, BUSUU],
      ...p,
    },
    30,
    today,
  );

const day = (daysAgo: number, apps: Record<string, number>): AppDay => ({
  daysAgo,
  date: key(addDays(today, -daysAgo)),
  total: Object.values(apps).reduce((s, v) => s + v, 0),
  apps,
});

const st = () => useHabits.getState();
const entryOf = (h: Habit, d = T) =>
  st().completions.find((c) => c.habitId === h.id && c.date === d);

beforeEach(() => setLang("pl"));

describe("which apps a habit suggests", () => {
  test("language habits: Duolingo + Busuu, plus other language apps on the phone", () => {
    const h = lang({ source: undefined, apps: undefined });
    expect(appKindOf(h)).toBe("language");
    expect(appKindOf({ name: "Angielski", icon: "Sparkles" })).toBe("language");
    expect(appKindOf({ name: "Learn Spanish", icon: "Sparkles" })).toBe("language");
    // installed unknown: both Busuu packages (old installs are com.busuu.android)
    expect(suggestedApps(h, null)).toEqual([DUO, BUSUU, "com.busuu.android"]);
    // nothing installed: still the two the user uses
    expect(suggestedApps(h, [])).toEqual([DUO, BUSUU]);
    const phone = [DUO, "com.ichi2.anki", "com.babbel.mobile.android.en", "com.instagram.android"];
    expect(suggestedApps(h, phone)).toEqual([
      DUO,
      BUSUU,
      "com.babbel.mobile.android.en",
      "com.ichi2.anki",
    ]);
    // old Busuu on the phone instead of the new one
    expect(suggestedApps(h, [DUO, "com.busuu.android"])).toEqual([DUO, "com.busuu.android"]);
  });

  test("reading habits: the readers installed; other habits: none", () => {
    const read = habit({ name: "Czytanie książki", icon: "BookOpen" });
    expect(appKindOf(read)).toBe("reading");
    expect(suggestedApps(read, ["com.amazon.kindle", DUO, "legimi.android.main"])).toEqual([
      "com.amazon.kindle",
      "legimi.android.main",
    ]);
    expect(suggestedApps(read, null)).toEqual([]);
    expect(appKindOf(habit({ name: "Programuj", icon: "Code" }))).toBeNull();
    expect(appKindOf(habit({ name: "Fast food", kind: "avoid" }))).toBeNull();
  });

  test("only minutes habits typed in by hand get the one-tap link", () => {
    const manual = lang({ source: undefined, apps: undefined });
    const list = [
      manual,
      lang(),
      habit({ name: "Czytanie", icon: "BookOpen", goal: { type: "count", target: 20 } }),
      habit({ name: "Programuj", icon: "Code", goal: { type: "minutes", target: 30 } }),
    ];
    expect(unlinkedAppHabits(list).map((h) => h.id)).toEqual([manual.id]);
    expect(isAppsHabit(list[1])).toBe(true);
    expect(isAppsHabit(lang({ apps: [] }))).toBe(false);
  });

  test("names", () => {
    expect(appLabel(DUO)).toBe("Duolingo");
    expect(appLabel("com.example.superreader")).toBe("Superreader");
    expect(appsList([DUO, BUSUU, "com.busuu.android"])).toBe("Duolingo i Busuu");
    expect(appsList([DUO, BUSUU, "com.ichi2.anki"])).toBe("Duolingo, Busuu i AnkiDroid");
    setLang("en");
    expect(appsList([DUO, BUSUU])).toBe("Duolingo and Busuu");
  });
});

describe("app minutes + a manual adjustment", () => {
  const c = (p: Partial<Completion>): Completion => ({ habitId: "x", date: T, ...p });

  test("the adjustment stays on top when the apps move, never below 0", () => {
    expect(appShift(undefined, 9)).toEqual({ amount: 9 });
    // 9 from apps + 2 by hand; apps reach 13
    expect(appShift(c({ amount: 11, appMin: 9, prev: [9, 4] }), 13)).toEqual({
      amount: 15,
      prev: [13, 8],
    });
    // took 5 off by hand, apps drop to 2 (trimmed events): never below 0
    expect(appShift(c({ amount: 4, appMin: 9 }), 2).amount).toBe(0);
    // typed in by hand before linking: the same activity, the larger counts
    expect(appShift(c({ amount: 10 }), 9).amount).toBe(10);
    expect(appShift(c({ amount: 5 }), 9).amount).toBe(9);
    expect(adjustmentOf(c({ amount: 11, appMin: 9 }))).toBe(2);
    expect(adjustmentOf(c({ amount: 11 }))).toBe(0);
  });

  test("breakdown: Duolingo 9 min + Busuu 4 min + ręcznie 2 min", () => {
    const e = c({ amount: 15, appMin: 13, appSplit: { [BUSUU]: 4, [DUO]: 9 } });
    expect(breakdown(e)).toBe("Duolingo 9 min + Busuu 4 min + ręcznie 2 min");
    expect(breakdown({ ...e, amount: 10 })).toBe("Duolingo 9 min + Busuu 4 min − ręcznie 3 min");
    expect(breakdown({ ...e, amount: 13 })).toBe("Duolingo 9 min + Busuu 4 min");
    expect(breakdown(c({ amount: 5, appMin: 0 }))).toBe("ręcznie 5 min");
    expect(breakdown(c({ amount: 5 }))).toBe("");
    setLang("en");
    expect(breakdown(e)).toBe("Duolingo 9 min + Busuu 4 min + by hand 2 min");
  });

  test("a clear on an apps habit only takes the manual part", () => {
    const h = lang();
    expect(appsFloor(h, c({ amount: 20, appMin: 13 }))).toBe(13);
    expect(appsFloor(h, c({ amount: 10, appMin: 13 }))).toBe(10);
    expect(appsFloor(h, undefined)).toBe(0);
    expect(appsFloor({ ...h, source: undefined }, c({ amount: 20, appMin: 13 }))).toBe(0);
  });

  test("sync plan: the habit's apps only, due days only, unchanged days skipped", () => {
    const h = lang();
    const cs: Completion[] = [
      entry(h, addDays(today, -1), { amount: 12, appMin: 12, appSplit: { [DUO]: 12 } }),
    ];
    const days = [
      day(0, { [DUO]: 9, [BUSUU]: 4, "com.instagram.android": 50 }),
      day(1, { [DUO]: 12 }),
      day(2, {}),
      day(3, { [DUO]: 6 }),
    ];
    const notDay3 = (d: string) => d !== key(addDays(today, -3));
    expect(appUpdates(h, cs, days, notDay3)).toEqual([
      { date: T, minutes: 13, split: { [DUO]: 9, [BUSUU]: 4 } },
    ]);
  });
});

describe("store: syncing never clobbers manual changes", () => {
  beforeEach(() => {
    useHabits.setState({ habits: [lang()], completions: [], seeded: true });
  });
  const h = () => st().habits[0];

  test("apps fill the day; holding adds on top; the next sync keeps it", () => {
    st().setAppMinutes(h().id, T, 9, { [DUO]: 9 }, 600);
    expect(entryOf(h())).toMatchObject({ amount: 9, appMin: 9, appSplit: { [DUO]: 9 } });
    st().logStep(h().id); // tile hold: +5 by hand
    expect(entryOf(h())!.amount).toBe(14);
    expect(entryOf(h())!.appMin).toBe(9);
    st().setAppMinutes(h().id, T, 13, { [DUO]: 9, [BUSUU]: 4 }, 700);
    expect(entryOf(h())).toMatchObject({ amount: 18, appMin: 13 });
    expect(breakdown(entryOf(h()))).toBe("Duolingo 9 min + Busuu 4 min + ręcznie 5 min");
    // stats read amount as before
    expect(amountOn(h(), st().completions, today)).toBe(18);
    expect(currentStreak(h(), st().completions, today)).toBeGreaterThanOrEqual(1);
    // same minutes again: nothing changes (no new undo step, same log)
    const before = entryOf(h());
    st().setAppMinutes(h().id, T, 13, { [DUO]: 9, [BUSUU]: 4 });
    expect(entryOf(h())).toBe(before!);
  });

  test("an amount set by hand (sheet / habit page) only moves the adjustment", () => {
    st().setAppMinutes(h().id, T, 10, { [DUO]: 10 });
    st().setAmount(h().id, T, 6); // "only 6 of those really counted"
    expect(entryOf(h())).toMatchObject({ amount: 6, appMin: 10 });
    expect(adjustmentOf(entryOf(h()))).toBe(-4);
    st().setAppMinutes(h().id, T, 15, { [DUO]: 15 });
    expect(entryOf(h())!.amount).toBe(11);
  });

  test("undo goes back through manual steps, shifted by what the apps added since", () => {
    st().setAppMinutes(h().id, T, 9, { [DUO]: 9 });
    st().logStep(h().id); // 14
    st().setAppMinutes(h().id, T, 12, { [DUO]: 12 }); // 17
    expect(st().undoLast(h().id, T)).toBe(12); // back to the app minutes only
    expect(entryOf(h())).toMatchObject({ amount: 12, appMin: 12 });
    // nothing typed by hand any more: nothing to undo (the apps would sync it right back)
    expect(st().undoLast(h().id, T)).toBeNull();
    expect(entryOf(h())!.amount).toBe(12);
  });

  test("linking and unlinking apps", () => {
    const manual = habit({
      name: "Ucz się języka obcego",
      icon: "Languages",
      goal: { type: "minutes", target: 15, step: 5 },
    });
    useHabits.setState({ habits: [manual], completions: [entry(manual, today, { amount: 10 })] });
    st().linkApps(manual.id, [DUO, BUSUU, DUO]);
    expect(st().habits[0]).toMatchObject({ source: "apps", apps: [DUO, BUSUU] });
    // typed by hand before linking: the larger of the two counts, then the apps take over
    st().setAppMinutes(manual.id, T, 8, { [DUO]: 8 });
    expect(entryOf(manual)).toMatchObject({ amount: 10, appMin: 8 });
    st().setAppMinutes(manual.id, T, 14, { [DUO]: 14 });
    expect(entryOf(manual)!.amount).toBe(16);
    st().linkApps(manual.id, []);
    expect(st().habits[0].source).toBeUndefined();
    expect(st().habits[0].apps).toBeUndefined();
  });

  test("backups keep the app minutes and the split; the persisted merge too", () => {
    st().setAppMinutes(h().id, T, 9, { [DUO]: 9 });
    st().setAmount(h().id, T, 12);
    const json = st().exportData();
    useHabits.setState({ habits: [], completions: [] });
    st().importData(json);
    expect(st().habits[0].apps).toEqual([DUO, BUSUU]);
    expect(entryOf(h())).toMatchObject({ amount: 12, appMin: 9, appSplit: { [DUO]: 9 } });
    const merge = useHabits.persist.getOptions().merge!;
    const merged = merge(JSON.parse(JSON.stringify(st())), st()) as ReturnType<typeof st>;
    expect(merged.completions.find((c) => c.habitId === h().id)).toMatchObject({ appMin: 9 });
    expect(merged.habits[0].source).toBe("apps");
  });
});

describe("widgets: rows and native ops", () => {
  beforeEach(() => {
    useHabits.setState({ habits: [lang()], completions: [], seeded: true });
  });
  const h = () => st().habits[0];

  test("rows carry the apps and the app minutes today's amount is based on", () => {
    st().setAppMinutes(h().id, T, 9, { [DUO]: 9 });
    st().setAmount(h().id, T, 11);
    const row = buildState().habits.find((r) => r.id === h().id)!;
    expect(row).toMatchObject({
      source: "apps",
      apps: [DUO, BUSUU],
      appMin: 9,
      appSplit: { [DUO]: 9 },
      amount: 11,
      goal: "minutes",
    });
    // other habits don't get the fields
    useHabits.setState({ habits: [lang({ source: undefined })] });
    expect("appMin" in buildState().habits[0]).toBe(false);
  });

  test("a native sync + tap replay to the same adjustment, idempotently", () => {
    st().setAppMinutes(h().id, T, 9, { [DUO]: 9 });
    // native tick saw 13 app minutes (amount 13), then a widget tap added 5 by hand (18)
    const ops = [
      { habitId: h().id, date: T, amount: 13, appMin: 13, appSplit: { [DUO]: 9, [BUSUU]: 4 } },
      { habitId: h().id, date: T, amount: 18, appMin: 13, minute: 700 },
    ];
    applyPendingOps(ops);
    expect(entryOf(h())).toMatchObject({
      amount: 18,
      appMin: 13,
      appSplit: { [DUO]: 9, [BUSUU]: 4 },
    });
    applyPendingOps(ops);
    expect(entryOf(h())).toMatchObject({ amount: 18, appMin: 13 });
    // the app's own sync afterwards keeps the widget's +5
    st().setAppMinutes(h().id, T, 15, { [DUO]: 11, [BUSUU]: 4 });
    expect(entryOf(h())!.amount).toBe(20);
    // the widget tap is undoable in the app
    expect(st().undoLast(h().id, T)).toBe(15);
  });
});
