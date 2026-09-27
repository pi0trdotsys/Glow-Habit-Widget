import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { SOCIAL_APPS, inLiveWindow, liveLines, liveState } from "@/lib/live";
import { useHabits } from "@/lib/habits/store";
import { buildState } from "@/lib/widget/bridge";

const JAVA = readFileSync(
  "android/app/src/main/java/app/lovable/glow_habit_widget/LiveGuard.java",
  "utf8",
);
const MANIFEST = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");

describe("night guard (Szpila na żywo)", () => {
  test("window check handles midnight crossing (mirrors LiveGuard.inWindow)", () => {
    expect(inLiveWindow(30, 0, 300)).toBe(true); // 00:30 in 00:00-05:00
    expect(inLiveWindow(300, 0, 300)).toBe(false); // 05:00 ends it
    expect(inLiveWindow(23 * 60 + 30, 0, 300)).toBe(false);
    expect(inLiveWindow(23 * 60 + 30, 23 * 60, 300)).toBe(true); // 23:00-05:00
    expect(inLiveWindow(120, 23 * 60, 300)).toBe(true);
    expect(inLiveWindow(600, 23 * 60, 300)).toBe(false);
    expect(inLiveWindow(0, 0, 0)).toBe(false);
  });

  test("every watched app has lines; every line pool is non-empty", () => {
    for (const level of ["hard", "soft"] as const) {
      const lines = liveLines(level, "Piotr");
      for (const app of SOCIAL_APPS) expect(lines[app.key]?.length).toBeGreaterThan(0);
      expect(lines.generic.length).toBeGreaterThan(0);
      expect(lines.escalate.length).toBeGreaterThan(0);
      // escalation lines talk about the minutes spent
      expect(lines.escalate.every((l) => l.includes("{m}"))).toBe(true);
      // only known placeholders survive (resolved natively)
      for (const pool of Object.values(lines))
        for (const l of pool)
          expect(l.replace(/\{(app|time|m|count|left|deadline)\}/g, "")).not.toMatch(/\{\w+\}/);
    }
    expect(liveLines("hard", "Piotr").generic.some((l) => l.includes("Piotr"))).toBe(true);
  });

  test("hard lines swear, soft ones don't", () => {
    const swear = /kurw|pierdol|jeb|gówn|wyrucha/i;
    expect(
      Object.values(liveLines("hard", null))
        .flat()
        .some((l) => swear.test(l)),
    ).toBe(true);
    expect(
      Object.values(liveLines("soft", null))
        .flat()
        .some((l) => swear.test(l)),
    ).toBe(false);
  });

  test("humor adds its own night lines", () => {
    const plain = liveLines("hard", null, "wredny");
    const trener = liveLines("hard", null, "trener");
    expect(trener.escalate.length).toBeGreaterThan(plain.escalate.length);
    expect(trener.generic.some((l) => l.includes("byku"))).toBe(true);
  });

  test("the snapshot carries live settings for the native guard", () => {
    const s = useHabits.getState();
    s.setNotifications({
      ...s.notifications,
      live: true,
      liveFrom: "00:30",
      liveUntil: "04:00",
      liveOff: ["com.reddit.frontpage"],
    });
    const st = buildState();
    expect(st.live.enabled).toBe(true);
    expect(st.live.from).toBe(30);
    expect(st.live.until).toBe(240);
    expect(st.live.off).toEqual(["com.reddit.frontpage"]);
    expect(st.live.lines.tiktok.length).toBeGreaterThan(0);
    expect(st.face).toBe("wredny");
    const n = liveState({ ...s.notifications, live: false }, "hard", null);
    expect(n.enabled).toBe(false);
  });

  test("Java package list, TS list and <queries> stay in sync", () => {
    for (const app of SOCIAL_APPS) {
      expect(JAVA).toContain(`"${app.pkg}", new String[]{"${app.key}", "${app.label}"}`);
      expect(MANIFEST).toContain(`<package android:name="${app.pkg}" />`);
    }
    const javaCount = (JAVA.match(/SOCIAL\.put\(/g) ?? []).length;
    expect(javaCount).toBe(SOCIAL_APPS.length);
    expect(MANIFEST).toContain('android:foregroundServiceType="specialUse"');
    expect(MANIFEST).toContain("FOREGROUND_SERVICE_SPECIAL_USE");
  });

  test("night visits merge into the store (max per night, never lower)", () => {
    const s = useHabits.getState();
    s.mergeNightHits({ "2026-09-20": 2 });
    s.mergeNightHits({ "2026-09-20": 1, "2026-09-21": 3 });
    expect(useHabits.getState().nightHits).toMatchObject({ "2026-09-20": 2, "2026-09-21": 3 });
    const backup = JSON.parse(useHabits.getState().exportData());
    expect(backup.nightHits["2026-09-21"]).toBe(3);
    expect(backup.szpila).toEqual({ face: "wredny", humor: "wredny" });
  });
});
