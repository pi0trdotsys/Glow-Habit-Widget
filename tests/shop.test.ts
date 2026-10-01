import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { addHours, addMinutes } from "date-fns";
import {
  SHOP_APPS,
  SHOP_PASS_MIN,
  WISH_WAIT_MS,
  fmtLeft,
  fmtMoney,
  hasShoppingHabit,
  lastDays,
  normalizeWishlist,
  parsePrice,
  shopLines,
  shopState,
  sortWishlist,
  wishLeftMs,
  wishLines,
  wishReady,
  wishSay,
  wishTotals,
  type WishItem,
} from "@/lib/shop";
import { SOCIAL_APPS, liveState } from "@/lib/live";
import { useHabits, type NotificationSettings } from "@/lib/habits/store";
import { statusSlideIds } from "@/components/StatusCarousel";
import { buildState } from "@/lib/widget/bridge";
import { setLang } from "@/lib/i18n";
import { WED_1540, habit, key } from "./helpers";

const JAVA = readFileSync(
  "android/app/src/main/java/app/lovable/glow_habit_widget/ShopGuard.java",
  "utf8",
);
const SERVICE = readFileSync(
  "android/app/src/main/java/app/lovable/glow_habit_widget/LiveGuardService.java",
  "utf8",
);
const ROUTES = readFileSync("src/routeTree.gen.ts", "utf8");

afterEach(() => setLang("pl"));
beforeEach(() => {
  useHabits.setState({ wishlist: [] });
});

const notif = (p: Partial<NotificationSettings> = {}): NotificationSettings => ({
  ...useHabits.getState().notifications,
  ...p,
});

const item = (p: Partial<WishItem> = {}): WishItem => ({
  id: `w${Math.random()}`,
  name: "Słuchawki",
  addedAt: WED_1540.toISOString(),
  status: "waiting",
  ...p,
});

const GENDERED = /\b\w+(łeś|łaś|łem|łam|łabyś|łbyś)\b/u;
const SWEAR = /kurw|chuj|pierdol|jeb|gówn|spierd|fuck|shit|damn|crap/i;
const PL_CHARS = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ„]/;

describe("shopping lines (block + pass + wishlist comments)", () => {
  for (const lang of ["pl", "en"] as const) {
    for (const level of ["hard", "soft"] as const) {
      test(`${lang}/${level}: every pool, valid placeholders, tone`, () => {
        setLang(lang);
        const s = shopLines(level);
        const w = wishLines(level);
        expect(s.shop.length).toBeGreaterThan(level === "hard" ? 12 : 3);
        expect(s.shopPass.length).toBeGreaterThan(0);
        const pools: [string[], Set<string>][] = [
          [s.shop, new Set(["app", "time", "count", "min"])],
          [s.shopPass, new Set(["app", "time", "count", "min"])],
          ...Object.values(w).map((p) => [p, new Set(["name", "min"])] as [string[], Set<string>]),
        ];
        for (const [pool, allowed] of pools) {
          expect(pool.length).toBeGreaterThan(0);
          for (const line of pool) {
            for (const m of line.matchAll(/\{(\w+)\}/g)) expect(allowed.has(m[1])).toBe(true);
            if (lang === "pl") expect(GENDERED.test(line)).toBe(false);
            if (lang === "en") expect(PL_CHARS.test(line)).toBe(false);
            if (level === "soft") expect(SWEAR.test(line)).toBe(false);
          }
        }
        // the block talks about the app (or waiting), the pass about its minutes
        expect(s.shop.some((l) => l.includes("{app}"))).toBe(true);
        expect(s.shopPass.every((l) => l.includes("{min}"))).toBe(true);
        if (level === "hard") expect(s.shop.some((l) => SWEAR.test(l))).toBe(true);
      });
    }
  }

  test("PL and EN differ and have the same pools and sizes", () => {
    setLang("pl");
    const pl = { ...shopLines("hard"), ...wishLines("hard") };
    setLang("en");
    const en = { ...shopLines("hard"), ...wishLines("hard") };
    expect(Object.keys(en)).toEqual(Object.keys(pl));
    for (const k of Object.keys(pl) as (keyof typeof pl)[]) expect(en[k].length).toBe(pl[k].length);
    expect(en.shop[0]).not.toBe(pl.shop[0]);
  });

  test("wishSay fills {name} and {min}", () => {
    const say = wishSay("hard", "bought", "Kurtka", 15, () => 0.5);
    expect(say).not.toContain("{");
    expect(wishSay("soft", "dropped", "Kurtka", 15, () => 0)).not.toContain("{name}");
  });
});

describe("shopping apps", () => {
  test("Java map and TS list stay in sync; no social media, no groceries", () => {
    for (const a of SHOP_APPS) expect(JAVA).toContain(`SHOP.put("${a.pkg}", "${a.label}")`);
    expect((JAVA.match(/SHOP\.put\(/g) ?? []).length).toBe(SHOP_APPS.length);
    const social = new Set(SOCIAL_APPS.map((a) => a.pkg));
    for (const a of SHOP_APPS) expect(social.has(a.pkg)).toBe(false);
    expect(SHOP_APPS.map((a) => a.pkg)).not.toContain("com.lidl.eci.lidlplus");
    expect(new Set(SHOP_APPS.map((a) => a.pkg)).size).toBe(SHOP_APPS.length);
  });

  test("the user's phone's shops are all covered", () => {
    const pkgs = new Set(SHOP_APPS.map((a) => a.pkg));
    for (const p of [
      "pl.allegro",
      "pl.allegro.sale",
      "com.alibaba.aliexpresshd",
      "fr.vinted",
      "pl.tablica",
      "de.zalando.mobile",
      "pl.xkom",
      "com.hm.goe",
      "com.action.consumerapp",
      "eu.pepco.app",
      "pl.com.rossmann.centauros",
    ])
      expect(pkgs.has(p)).toBe(true);
  });

  test("the block's deep link targets a registered route; the service follows it", () => {
    expect(SERVICE).toContain('"/wishlist?add=1&app="');
    expect(ROUTES).toContain("'/wishlist'");
    expect(ROUTES).toContain("./routes/wishlist");
  });
});

describe("snapshot (live.shop)", () => {
  test("off by default for new installs; settings and wishlist counts go native", () => {
    const n = useHabits.getState().notifications;
    expect(n.shopGuard).toBe(false);
    expect(n.shopPassMin).toBe(SHOP_PASS_MIN);
    const now = WED_1540;
    const list = [
      item({ addedAt: addHours(now, -2).toISOString() }), // waiting
      item({ addedAt: addHours(now, -30).toISOString() }), // ready
      item({ status: "dropped", price: 120 }),
      item({ status: "dropped", price: 300 }),
      item({ status: "bought", price: 50 }),
    ];
    expect(shopState(notif({ shopGuard: true, shopOff: ["fr.vinted"] }), list, now)).toEqual({
      enabled: true,
      off: ["fr.vinted"],
      passMin: 15,
      waiting: 1,
      ready: 1,
      saved: 2,
      savedMoney: 420,
    });
    const live = liveState(notif({ shopGuard: true }), "hard", null, undefined, [], list);
    expect(live.shop.enabled).toBe(true);
    expect(live.lines.shop.length).toBeGreaterThan(0);
    expect(live.lines.shopPass.length).toBeGreaterThan(0);
    expect(liveState(notif(), "soft", null).shop.enabled).toBe(false);
  });

  test("an old save without the new fields gets the defaults (merge backfill)", () => {
    const old = { ...useHabits.getState().notifications } as Partial<NotificationSettings>;
    delete old.shopGuard;
    delete old.shopOff;
    delete old.shopPassMin;
    const s = shopState(old as NotificationSettings, []);
    expect(s).toMatchObject({ enabled: false, off: [], passMin: 15 });
  });

  test("buildState carries the wishlist counts", () => {
    useHabits.setState({ wishlist: [item({ status: "dropped", price: 99 })] });
    const st = buildState();
    expect(st.live.shop.saved).toBe(1);
    expect(st.live.shop.savedMoney).toBe(99);
  });
});

describe("the wishlist", () => {
  test("an item is ready only after 24 h", () => {
    const w = item();
    expect(wishReady(w, addHours(WED_1540, 23))).toBe(false);
    expect(wishReady(w, new Date(WED_1540.getTime() + WISH_WAIT_MS))).toBe(true);
    expect(wishReady({ ...w, status: "dropped" }, addHours(WED_1540, 48))).toBe(false);
    expect(wishLeftMs(w, addHours(WED_1540, 7))).toBe(17 * 3600_000);
    expect(wishLeftMs(w, addHours(WED_1540, 30))).toBe(0);
  });

  test("countdown text", () => {
    expect(fmtLeft(17 * 3600_000)).toBe("jeszcze 17 h");
    expect(fmtLeft(16.2 * 3600_000)).toBe("jeszcze 17 h"); // rounded up
    expect(fmtLeft(40 * 60_000)).toBe("jeszcze 40 min");
    expect(fmtLeft(10_000)).toBe("jeszcze 1 min");
    expect(fmtLeft(0)).toBe("gotowe");
    setLang("en");
    expect(fmtLeft(5 * 3600_000)).toBe("5 h to go");
    expect(fmtMoney(1420)).toBe("1 420 PLN");
    setLang("pl");
    expect(fmtMoney(420)).toBe("420 zł");
  });

  test("store: add, buying waits for the day, dropping works any time", () => {
    const s = useHabits.getState();
    const id = s.addWish({ name: "  Kurtka  ", price: 299, app: "de.zalando.mobile" }, WED_1540);
    const w = useHabits.getState().wishlist.find((x) => x.id === id)!;
    expect(w).toMatchObject({
      name: "Kurtka",
      price: 299,
      status: "waiting",
      app: "de.zalando.mobile",
    });
    expect(s.addWish({ name: "   " })).toBe("");
    // too early to buy
    s.decideWish(id, "bought", addHours(WED_1540, 3));
    expect(useHabits.getState().wishlist[0].status).toBe("waiting");
    s.decideWish(id, "bought", addHours(WED_1540, 25));
    expect(useHabits.getState().wishlist[0]).toMatchObject({ status: "bought" });
    expect(useHabits.getState().wishlist[0].decidedAt).toBe(addHours(WED_1540, 25).toISOString());
    // decided items stay decided
    s.decideWish(id, "dropped", addHours(WED_1540, 26));
    expect(useHabits.getState().wishlist[0].status).toBe("bought");

    const id2 = s.addWish({ name: "Kubek", price: 40 }, WED_1540);
    s.decideWish(id2, "dropped", addMinutes(WED_1540, 5));
    const t = wishTotals(useHabits.getState().wishlist, addHours(WED_1540, 30));
    expect(t).toEqual({
      waiting: 0,
      ready: 0,
      saved: 1,
      savedMoney: 40,
      bought: 1,
      boughtMoney: 299,
    });
    s.removeWish(id2);
    expect(useHabits.getState().wishlist.map((x) => x.id)).toEqual([id]);
  });

  test("backup roundtrip keeps the wishlist; junk is dropped; old backups keep the current list", () => {
    const s = useHabits.getState();
    s.addWish({ name: "Konsola", price: 2000 }, WED_1540);
    const json = s.exportData();
    expect(JSON.parse(json).wishlist).toHaveLength(1);
    useHabits.setState({ wishlist: [] });
    useHabits.getState().importData(json);
    expect(useHabits.getState().wishlist[0]).toMatchObject({ name: "Konsola", price: 2000 });

    const data = JSON.parse(json);
    data.wishlist = [
      { id: "a", name: "OK", addedAt: WED_1540.toISOString(), status: "dropped", price: 10 },
      { id: "b", name: "zła data", addedAt: "nope", status: "waiting" },
      { name: "bez id", addedAt: WED_1540.toISOString() },
      {
        id: "c",
        name: "dziwny status",
        addedAt: WED_1540.toISOString(),
        status: "lost",
        price: -3,
      },
      null,
    ];
    useHabits.getState().importData(JSON.stringify(data));
    const list = useHabits.getState().wishlist;
    expect(list.map((w) => w.id)).toEqual(["a", "c"]);
    expect(list[1]).toEqual({
      id: "c",
      name: "dziwny status",
      addedAt: WED_1540.toISOString(),
      status: "waiting",
    });

    delete data.wishlist;
    useHabits.getState().importData(JSON.stringify(data));
    expect(useHabits.getState().wishlist.map((w) => w.id)).toEqual(["a", "c"]);
    expect(normalizeWishlist(undefined)).toEqual([]);
  });

  test("order: ready first, then the soonest waiting, then the newest decided", () => {
    const now = addHours(WED_1540, 30);
    const a = item({ id: "ready", addedAt: WED_1540.toISOString() });
    const b = item({ id: "soon", addedAt: addHours(WED_1540, 10).toISOString() });
    const c = item({ id: "late", addedAt: addHours(WED_1540, 20).toISOString() });
    const d = item({
      id: "old",
      status: "dropped",
      decidedAt: addHours(WED_1540, 1).toISOString(),
    });
    const e = item({ id: "new", status: "bought", decidedAt: addHours(WED_1540, 2).toISOString() });
    expect(sortWishlist([e, c, d, b, a], now).map((w) => w.id)).toEqual([
      "ready",
      "soon",
      "late",
      "new",
      "old",
    ]);
  });

  test("prices typed by hand", () => {
    expect(parsePrice("49,99")).toBe(49.99);
    expect(parsePrice("120 zł")).toBe(120);
    expect(parsePrice("1 200")).toBe(1200);
    expect(parsePrice("")).toBeUndefined();
    expect(parsePrice("abc")).toBeUndefined();
    expect(parsePrice("-5")).toBeUndefined();
  });
});

describe("stats, suggestion and Today", () => {
  test("blocks this week = the last 7 calendar days", () => {
    const now = WED_1540;
    const counts: Record<string, number> = {};
    for (let i = 0; i < 10; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      counts[key(d)] = 1;
    }
    expect(lastDays(counts, 7, now)).toBe(7);
    expect(lastDays(undefined)).toBe(0);
  });

  test("the guard is suggested for an avoid habit about shopping", () => {
    expect(hasShoppingHabit([habit({ name: "Impulsywne wydawanie", kind: "avoid" })])).toBe(true);
    expect(hasShoppingHabit([habit({ name: "Impulse shopping", kind: "avoid" })])).toBe(true);
    expect(hasShoppingHabit([habit({ name: "Fast food", kind: "avoid" })])).toBe(false);
    expect(hasShoppingHabit([])).toBe(false);
  });

  test("Today shows the wishlist slide only with ready items, after Szpila", () => {
    expect(statusSlideIds({ morning: false, bill: false, social: false })).not.toContain("wish");
    expect(statusSlideIds({ morning: true, bill: false, social: true, wish: true })).toEqual([
      "morning",
      "szpila",
      "wish",
      "social",
    ]);
  });
});
