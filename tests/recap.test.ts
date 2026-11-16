import { describe, expect, test } from "bun:test";
import { homeRecap, recapBlocks, recapDay, type Recap } from "../src/lib/coach";

const at = (s: string) => new Date(s).getTime();
const r = (
  day: string,
  text = "🤖 Piotr, połowa.\n\n💡 Woda: rano.\n\n✅ Zrobione: Woda",
): Recap => ({
  day,
  title: "🍻 Podsumowanie dnia · 50%",
  text,
  at: at(`${day}T22:00:00`),
  ai: true,
});

describe("day recaps in the app", () => {
  test("the home card shows tonight's recap, and last night's only until noon", () => {
    const items = [r("2026-11-15")];
    expect(homeRecap(items, new Date("2026-11-15T22:30:00"))).toBe(items[0]);
    expect(homeRecap(items, new Date("2026-11-16T08:00:00"))).toBe(items[0]);
    expect(homeRecap(items, new Date("2026-11-16T12:00:00"))).toBeNull();
    expect(homeRecap(items, new Date("2026-11-17T08:00:00"))).toBeNull();
    expect(homeRecap([], new Date("2026-11-15T22:30:00"))).toBeNull();
  });

  test("a recap saved before the history existed gets its day from when it was shown", () => {
    const old: Recap = { title: "t", text: "x", at: at("2026-11-14T21:50:00"), ai: false };
    expect(recapDay(old)).toBe("2026-11-14");
    expect(recapDay(r("2026-11-15"))).toBe("2026-11-15");
  });

  test("the text splits into the comment, the tip and the lists", () => {
    expect(recapBlocks(r("2026-11-15").text)).toEqual([
      "🤖 Piotr, połowa.",
      "💡 Woda: rano.",
      "✅ Zrobione: Woda",
    ]);
    expect(recapBlocks("Dziś: 0%.\n\n\n⏳ Zabrakło: Woda\n💥 Wpadki: Fast food")).toEqual([
      "Dziś: 0%.",
      "⏳ Zabrakło: Woda\n💥 Wpadki: Fast food",
    ]);
  });
});
