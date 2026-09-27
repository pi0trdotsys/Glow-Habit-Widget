import { describe, expect, test } from "bun:test";
import { handleBack, pushBackHandler } from "@/lib/back";
import { backupFileName, restoreBackup } from "@/lib/backup";
import { SPLASH_MS } from "@/components/SplashScreen";
import { HOLD_TO_COMPLETE_MS } from "@/hooks/useHoldToComplete";
import { useHabits } from "@/lib/habits/store";

describe("Android back button", () => {
  test("closes the most recently opened thing first, then lets the system go back", () => {
    const closed: string[] = [];
    const offSheet = pushBackHandler({ current: () => closed.push("sheet") });
    pushBackHandler({ current: () => closed.push("plan") });
    expect(handleBack()).toBe(true);
    expect(handleBack()).toBe(true);
    expect(closed).toEqual(["plan", "sheet"]);
    expect(handleBack()).toBe(false); // nothing open -> WebView goes back / app exits
    offSheet(); // unregistering twice is harmless
  });

  test("an unregistered handler never fires", () => {
    let fired = false;
    const off = pushBackHandler({ current: () => (fired = true) });
    off();
    expect(handleBack()).toBe(false);
    expect(fired).toBe(false);
  });

  test("window.__loopBack is the entry point used by MainActivity", () => {
    const w = globalThis as unknown as { __loopBack?: () => boolean };
    expect(typeof w.__loopBack).toBe("function");
  });
});

describe("timings", () => {
  test("splash is short (under a second) and holding takes long enough to be deliberate", () => {
    expect(SPLASH_MS).toBeLessThanOrEqual(1000);
    expect(HOLD_TO_COMPLETE_MS).toBeGreaterThanOrEqual(1000);
  });
});

describe("backups", () => {
  test("file name uses the local date (not UTC)", () => {
    const justAfterMidnight = new Date(2026, 8, 26, 0, 30); // UTC is still the 25th in CEST
    expect(backupFileName(justAfterMidnight)).toBe("szpila-kopia-2026-09-26.json");
  });

  test("restore explains what went wrong", async () => {
    useHabits.setState({ habits: [], completions: [] });
    await expect(restoreBackup(new File(["nie json"], "x.json"))).rejects.toThrow(
      "Plik nie jest poprawnym JSON-em.",
    );
    await expect(restoreBackup(new File(['{"a":1}'], "x.json"))).rejects.toThrow(
      "To nie jest kopia zapasowa Szpili.",
    );
    const ok = JSON.stringify({
      habits: [{ id: "a", name: "Woda", schedule: { type: "daily" } }],
      completions: [],
    });
    expect(await restoreBackup(new File([ok], "x.json"))).toBe(1);
  });
});
