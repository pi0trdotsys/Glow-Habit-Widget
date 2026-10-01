// End-to-end checks on the real built app (dist/client) in headless Edge/Chrome.
// Run: bun run test:e2e   (builds first)
import { assert, check, finish, launch, sleep } from "./harness";

const day = 86_400_000;
const now = new Date();
now.setHours(14, 35, 0, 0);
const key = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const created = new Date(now.getTime() - 20 * day).toISOString();
const H = (id: string, p: object) => ({
  id,
  createdAt: created,
  schedule: { type: "daily" },
  color: "mint",
  ...p,
});

const state = {
  state: {
    seeded: true,
    userName: "Test",
    // Headless Edge reports English - the Polish checks below need Polish.
    language: "pl",
    autoBackup: true,
    habits: [
      H("water", {
        name: "Picie wody",
        icon: "GlassWater",
        goal: { type: "count", target: 8, step: 1, unit: "szklanek" },
      }),
      H("read", {
        name: "Czytanie książki",
        icon: "BookOpen",
        goal: { type: "minutes", target: 20, step: 10 },
      }),
      H("food", {
        name: "Fast food",
        icon: "Hamburger",
        kind: "avoid",
        limit: { times: 1, period: "week" },
      }),
      H("bed", {
        name: "Scrollowanie w łóżku",
        icon: "Smartphone",
        kind: "avoid",
        source: "screen",
        lateAfter: "00:00",
      }),
    ],
    // Social media minutes by day (the daily limit, 60 min by default).
    daySocial: {
      [key(now)]: 30,
      [key(new Date(now.getTime() - day))]: 75,
      [key(new Date(now.getTime() - 2 * day))]: 50,
    },
    // Last night's bill (normally synced from the phone's usage stats).
    nightReports: {
      [key(new Date(now.getTime() - day))]: {
        date: key(new Date(now.getTime() - day)),
        granted: true,
        apps: [{ pkg: "com.instagram.android", label: "Instagram", visits: 3, minutes: 22 }],
        visits: 3,
        social: 22,
        screen: 40,
        asleep: 100,
        // curfew + charger (LiveGuardService)
        charged: 1428,
        curfewBlocks: 2,
        curfewPasses: 0,
      },
    },
    completions: [
      { habitId: "water", date: key(now), amount: 2, log: [[600, 2]] },
      // 8 perfect days before today -> an 8-day forma streak (unlocks Kujon, Diabeł, Trener)
      ...Array.from({ length: 8 }, (_, i) => key(new Date(now.getTime() - (i + 1) * day))).flatMap(
        (d) => [
          { habitId: "water", date: d, amount: 8 },
          { habitId: "read", date: d, amount: 20 },
          { habitId: "food", date: d },
        ],
      ),
    ],
  },
  version: 3,
};

// Freeze "now" at 14:35 today and seed the store before the app boots.
const preload = `(() => {
  const OFF = ${now.getTime()} - Date.now();
  const R = Date;
  class D extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + OFF); } static now() { return R.now() + OFF; } }
  globalThis.Date = D;
  // show the native guard's status slides (social media limit) on the web
  globalThis.__szpilaForceGuard = true;
  if (!sessionStorage.getItem("seeded")) {
    localStorage.setItem("loop-habits-v1", ${JSON.stringify(JSON.stringify(state))});
    sessionStorage.setItem("seeded", "1");
  }
})();`;

const byText = (sel: string, text: string) =>
  `[...document.querySelectorAll(${JSON.stringify(sel)})].find(e => e.textContent.includes(${JSON.stringify(text)}))`;
const splashVisible = `!![...document.querySelectorAll("h1")].find(e => e.textContent.trim() === "Szpila")`;

const page = await launch(preload);
console.log("Szpila E2E");

await check("splash is gone in under ~1.3 s", async () => {
  // Warm-up visit: the first request to the local test server measures a cold
  // browser cache, not the app (on the phone the files come from the APK).
  await page.goto("/");
  await page.waitFor(splashVisible, 3000);
  await page.waitFor(`!(${splashVisible})`, 5000);
  await page.goto("/?measure");
  await page.waitFor(splashVisible, 3000);
  const ms = await page.waitFor(`!(${splashVisible})`, 3000);
  assert(ms < 1300, `splash took ${ms} ms`);
});

await check("Today shows greeting, progress ring and the 'Teraz' card", async () => {
  await page.waitFor(`document.body.innerText.includes("Test")`);
  const text = await page.eval<string>("document.body.innerText");
  assert(/Postęp dnia|%/.test(text), "no progress ring");
  assert(text.includes("TERAZ") || text.includes("Teraz"), "no Teraz card");
  assert(text.includes("Picie wody"), "habit tile missing");
});

await check("screen-judged 'Scrollowanie w łóżku' is neither ticked nor missed (📱)", async () => {
  const chip = await page.eval<string>(
    `(${byText("button", "Scrollowanie w łóżku")})?.textContent ?? ""`,
  );
  assert(chip.includes("📱"), `chip says: ${chip}`);
  const counter = await page.eval<string>(
    `document.body.innerText.match(/\\d+\\/\\d+ zrobione/)?.[0] ?? ""`,
  );
  assert(counter.endsWith("/3 zrobione"), `undecided night must not count: ${counter}`);
});

await check("forbidden chip opens a bottom sheet; 'Czysto' ticks it", async () => {
  await page.eval(`(${byText("button:not([data-focus-pick])", "Fast food")}).click()`);
  await page.waitFor(`!!(${byText("button", "Czysto")})`);
  await page.eval(
    `[...document.querySelectorAll("button")].find(e => e.textContent.trim().endsWith("Czysto")).click()`,
  );
  await page.waitFor(
    `(${byText("button:not([data-focus-pick])", "Fast food")}).textContent.includes("✓")`,
  );
});

/** Drag the first live toast horizontally by dx px with the mouse (fires pointer events). */
async function swipeToast(dx: number): Promise<void> {
  await page.waitFor(
    `document.querySelectorAll("[data-sonner-toast]:not([data-removed='true'])").length > 0`,
  );
  const box = await page.eval<{ x: number; y: number }>(
    `(() => { const r = document.querySelector("[data-sonner-toast]:not([data-removed='true'])").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  const mouse = (type: string, x: number) =>
    page.send("Input.dispatchMouseEvent", {
      type,
      x,
      y: box.y,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
    });
  await mouse("mousePressed", box.x);
  for (let step = 1; step <= 15; step++) {
    await mouse("mouseMoved", box.x + (dx * step) / 15);
    await sleep(8);
  }
  await mouse("mouseReleased", box.x + dx);
  await page.waitFor(
    `document.querySelectorAll("[data-sonner-toast]:not([data-removed='true'])").length === 0`,
    2000,
  );
}

async function answerChip(answer: "Czysto" | "Wpadka"): Promise<void> {
  await page.eval(`(${byText("button:not([data-focus-pick])", "Fast food")}).click()`);
  await page.waitFor(`!!(${byText("button", answer)})`);
  await page.eval(
    `[...document.querySelectorAll("button")].find(e => e.textContent.trim().endsWith(${JSON.stringify(answer)})).click()`,
  );
}

await check("a completion toast can be swiped away to the left", async () => {
  await swipeToast(-220); // the praise toast from answering the chip above
});

await check("... and to the right", async () => {
  await answerChip("Wpadka");
  await swipeToast(220);
});

await check("toasts also have a close button and never stack above 2", async () => {
  for (const answer of ["Wpadka", "Czysto", "Wpadka", "Czysto"]) {
    await page.eval(`(${byText("button:not([data-focus-pick])", "Fast food")}).click()`);
    await page.waitFor(`!!(${byText("button", answer)})`);
    await page.eval(
      `[...document.querySelectorAll("button")].find(e => e.textContent.trim().endsWith(${JSON.stringify(answer)})).click()`,
    );
    await sleep(150);
  }
  const visible = await page.eval<number>(
    `document.querySelectorAll("[data-sonner-toast][data-visible='true']").length`,
  );
  assert(visible <= 2, `${visible} toasts visible`);
  assert(
    await page.eval<boolean>(`!!document.querySelector("[data-sonner-toast] [data-close-button]")`),
    "no close button",
  );
});

await check("system back closes the open sheet first (window.__loopBack)", async () => {
  await page.eval(`(${byText("button:not([data-focus-pick])", "Fast food")}).click()`);
  await page.waitFor(`!!(${byText("button", "Wpadka")})`);
  assert(await page.eval<boolean>("window.__loopBack()"), "back not consumed");
  await page.waitFor(`!(${byText("button", "Wpadka")})`, 2000);
  assert(!(await page.eval<boolean>("window.__loopBack()")), "nothing should be left to close");
});

await check("day plan folds open and back closes it", async () => {
  await page.eval(`(${byText("button", "Plan dnia")}).click()`);
  await page.waitFor(
    `document.body.innerText.includes("Czytanie książki") && !!document.querySelector("ul.divide-y")`,
  );
  assert(await page.eval<boolean>("window.__loopBack()"), "plan not closed by back");
});

await check("navigating to Raport and back returns to Today", async () => {
  await page.eval(`(${byText("a", "Raport")}).click()`);
  await page.waitFor(`location.pathname === "/report"`);
  await page.waitFor(`document.body.innerText.includes("Tydzień do tygodnia")`);
  await page.eval("history.back()");
  await page.waitFor(`location.pathname === "/"`);
});

await check("Szpila tab: forma streak, 3 weekly challenges, unlocked faces", async () => {
  await page.eval(`(${byText("a", "Szpila")}).click()`);
  await page.waitFor(`location.pathname === "/szpila"`);
  await page.waitFor(`/wyzwania tygodnia/i.test(document.body.innerText)`);
  const text = await page.eval<string>("document.body.innerText");
  assert(/\b8\s*dni w formie z rzędu/.test(text), `streak of 8 not shown: ${text.slice(0, 400)}`);
  const challenges = await page.eval<number>(
    `document.querySelectorAll("[data-challenge]").length`,
  );
  assert(challenges === 3, `${challenges} challenges`);
  assert(
    await page.eval<boolean>(`!!document.querySelector('[aria-label="Mina Diabeł"]')`),
    "Diabeł should be unlocked",
  );
  assert(
    await page.eval<boolean>(`!!document.querySelector('[aria-label="Mina Król (zablokowana)"]')`),
    "Król should be locked",
  );
  // "kot w domu": an 8-day forma streak = groomed
  const cond = await page.eval<string>(
    `document.querySelector("[data-condition]")?.dataset.condition ?? ""`,
  );
  assert(cond === "groomed", `cat condition: ${cond}`);
  assert(/zadbany i zadowolony/.test(text), "condition label missing");
});

await check("picking an unlocked face saves it; a locked one only explains why", async () => {
  await page.eval(`document.querySelector('[aria-label="Mina Diabeł"]').click()`);
  await page.waitFor(
    `JSON.parse(localStorage.getItem("loop-habits-v1")).state.szpila.face === "diabel"`,
  );
  await page.eval(`document.querySelector('[aria-label="Mina Król (zablokowana)"]').click()`);
  await page.waitFor(`document.body.innerText.includes("Potrzebujesz 14 dni formy")`);
  const face = await page.eval<string>(
    `JSON.parse(localStorage.getItem("loop-habits-v1")).state.szpila.face`,
  );
  assert(face === "diabel", `face changed to ${face}`);
  // the chosen humor: Trener is unlocked at 5 days
  await page.eval(`(${byText("button", "Drze się jak na siłowni")}).click()`);
  await page.waitFor(
    `JSON.parse(localStorage.getItem("loop-habits-v1")).state.szpila.humor === "trener"`,
  );
});

await check("Raport: 90-day trend and month comparison tabs", async () => {
  await page.eval(`(${byText("a", "Raport")}).click()`);
  await page.waitFor(`location.pathname === "/report"`);
  await page.eval(`(${byText("button", "90 dni")}).click()`);
  await page.waitFor(`!!document.querySelector('svg[aria-label="Trend z 90 dni"]')`);
  const bars = await page.eval<number>(
    `document.querySelectorAll('svg[aria-label="Trend z 90 dni"] rect').length`,
  );
  assert(bars >= 9, `only ${bars} day bars`);
  // social media by day against the limit: 2 of 3 tracked days within 60 min
  await page.waitFor(`!!document.querySelector("[data-day-limit-chart]")`);
  const within = await page.eval<string>(`document.querySelector("[data-within]").innerText`);
  assert(within.includes("2/3"), `within the limit: ${within}`);
  const dayBars = await page.eval<number>(
    `document.querySelectorAll("[data-day-limit-chart] rect").length`,
  );
  assert(dayBars === 3, `${dayBars} day bars`);
  // last nights from the night bill
  await page.waitFor(`!!document.querySelector("[data-night-list]")`);
  const nights = await page.eval<string>(`document.querySelector("[data-night-list]").innerText`);
  assert(
    nights.includes("3× Instagram · 22 min") &&
      nights.includes("01:40") &&
      nights.includes("ładowarka 23:48") &&
      nights.includes("2× blokada"),
    `night list: ${nights}`,
  );
  await page.eval(`(${byText("button", "Miesiące")}).click()`);
  await page.waitFor(`document.body.innerText.includes("Miesiąc do miesiąca")`);
  const months = await page.eval<number>(`document.querySelectorAll("[data-month]").length`);
  assert(months === 6, `${months} months`);
});

await check("CSV export produces a file (web: download + toast)", async () => {
  await page.eval(
    `window.__csv = null; const o = URL.createObjectURL; URL.createObjectURL = (b) => { window.__csv = b; return o(b); }`,
  );
  await page.eval(`(${byText("button", "Eksport CSV")}).click()`);
  await page.waitFor(`!!window.__csv`);
  // Blob.text() strips the BOM - check the raw bytes for it (Excel needs it for Polish letters)
  const bom = await page.eval<number[]>(
    `window.__csv.arrayBuffer().then((b) => [...new Uint8Array(b).slice(0, 3)])`,
  );
  assert(bom.join() === "239,187,191", `no UTF-8 BOM: ${bom}`);
  const csv = await page.eval<string>(`window.__csv.text()`);
  assert(csv.startsWith("data;zadanie;rodzaj"), "bad CSV header");
  assert(csv.includes(";Picie wody;do zrobienia;8;"), "missing rows");
  await page.waitFor(`document.body.innerText.includes("szpila-historia-")`);
});

// ---------------------------------------------------------------- UX: status card, quick amounts, tabs, theme

/** Centre of the first element matching a CSS selector. */
async function centre(sel: string): Promise<{ x: number; y: number }> {
  return page.eval(
    `(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
}
const mouse = (type: string, x: number, y: number) =>
  page.send("Input.dispatchMouseEvent", {
    type,
    x,
    y,
    button: "left",
    buttons: type === "mouseReleased" ? 0 : 1,
    clickCount: 1,
  });
const waterAmount = `((JSON.parse(localStorage.getItem("loop-habits-v1")).state.completions.find((c) => c.habitId === "water" && c.date === "${key(now)}") || {}).amount || 0)`;

await check("Today: one swipeable status card (Szpila + social media) with dots", async () => {
  await page.goto("/");
  await page.waitFor(`!!document.querySelector("[data-status-carousel]")`, 6000);
  const slides = await page.eval<string>(
    `document.querySelector("[data-status-carousel]").dataset.slides`,
  );
  assert(slides === "szpila,social,focus", `slides: ${slides}`);
  assert(
    await page.eval<boolean>(
      `document.querySelectorAll("[data-status-carousel] [role=tab]").length === 3`,
    ),
    "no dots",
  );
  // swipe (scroll) to the second card -> the second dot is active
  await page.eval(
    `(() => { const t = document.querySelector("[data-status-carousel] > div"); t.scrollTo({ left: t.clientWidth }); })()`,
  );
  await page.waitFor(
    `document.querySelectorAll("[data-status-carousel] [role=tab]")[1].getAttribute("aria-selected") === "true"`,
  );
  const social = await page.eval<string>(`document.querySelector("[data-social-today]").innerText`);
  // last night's 22 min of Instagram cost 2 × 22 = 44 min of today's 60
  assert(social.includes("30/16 min"), `social: ${social}`);
  assert(social.includes("Noc zabrała 44 min"), `no night debt: ${social}`);
  // the habits are visible without scrolling
  const tileTop = await page.eval<number>(
    `document.querySelector("[data-tile]").getBoundingClientRect().top`,
  );
  assert(tileTop < 844, `first tile at ${tileTop}px`);
});

await check("hold a tile longer: the quick amount sheet, +5 adds five glasses", async () => {
  await page.waitFor(`!(${splashVisible})`, 5000); // the splash would catch the press
  const before = await page.eval<number>(waterAmount);
  const c = await centre('[data-tile="water"]');
  await mouse("mousePressed", c.x, c.y);
  await sleep(2700); // past the +1 (1.2 s) to the sheet (2.4 s)
  await mouse("mouseReleased", c.x, c.y);
  await page.waitFor(`!!document.querySelector("[data-quick-sheet]")`);
  // the +1 of the normal hold was taken back when the sheet opened
  assert((await page.eval<number>(waterAmount)) === before, "the long hold should not keep the +1");
  await page.eval(`document.querySelector('[data-quick-add="5"]').click()`);
  await page.waitFor(`!document.querySelector("[data-quick-sheet]")`);
  const after = await page.eval<number>(waterAmount);
  assert(after === before + 5, `${before} -> ${after}`);
});

await check("the sheet's slider + Ustaw sets an exact amount; Back closes it", async () => {
  const c = await centre('[data-tile="read"]');
  await mouse("mousePressed", c.x, c.y);
  await sleep(2700);
  await mouse("mouseReleased", c.x, c.y);
  await page.waitFor(`!!document.querySelector("[data-quick-sheet]")`);
  assert(await page.eval<boolean>("window.__loopBack()"), "back didn't close the sheet");
  await page.waitFor(`!document.querySelector("[data-quick-sheet]")`);
  await mouse("mousePressed", c.x, c.y);
  await sleep(2700);
  await mouse("mouseReleased", c.x, c.y);
  await page.waitFor(`!!document.querySelector("[data-quick-sheet]")`);
  await page.eval(
    `(() => { const r = document.querySelector('[data-quick-sheet] input[type=range]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(r, "10"); r.dispatchEvent(new Event("input", { bubbles: true })); })()`,
  );
  await page.waitFor(`document.querySelector("[data-quick-value]").innerText.startsWith("10")`);
  await page.eval(`document.querySelector("[data-quick-save]").click()`);
  await page.waitFor(
    `(JSON.parse(localStorage.getItem("loop-habits-v1")).state.completions.find((c) => c.habitId === "read" && c.date === "${key(now)}") || {}).amount === 10`,
  );
});

await check("swipe a tile sideways: the last entry is undone", async () => {
  // the closing sheet's backdrop must be gone first
  await page.waitFor(
    `!document.querySelector("[data-quick-sheet]") && !document.querySelector(".fixed.inset-0.z-50")`,
    3000,
  );
  await sleep(300);
  const before = await page.eval<number>(waterAmount);
  const c = await centre('[data-tile="water"]');
  await mouse("mousePressed", c.x, c.y);
  for (let i = 1; i <= 10; i++) {
    await mouse("mouseMoved", c.x - i * 9, c.y + 1);
    await sleep(10);
  }
  await mouse("mouseReleased", c.x - 90, c.y + 1);
  await page.waitFor(`(${waterAmount}) < ${before}`, 3000);
  const after = await page.eval<number>(waterAmount);
  assert(after === before - 5, `the +5 should be undone: ${before} -> ${after}`);
});

await check("completing the whole day: confetti", async () => {
  // water to 8, read to 20 via the store, the forbidden one via its chip
  await page.eval(
    `(() => { const d = JSON.parse(localStorage.getItem("loop-habits-v1")); d.state.completions = d.state.completions.filter((c) => c.date !== "${key(now)}"); d.state.completions.push({ habitId: "water", date: "${key(now)}", amount: 7 }, { habitId: "read", date: "${key(now)}", amount: 20 }, { habitId: "food", date: "${key(now)}" }); localStorage.setItem("loop-habits-v1", JSON.stringify(d)); })()`,
  );
  await page.goto("/?confetti");
  await page.waitFor(`!!document.querySelector('[data-tile="water"]')`, 6000);
  await sleep(1200);
  assert(
    !(await page.eval<boolean>(`!!document.querySelector("canvas[data-confetti]")`)),
    "no confetti on load",
  );
  const c = await centre('[data-tile="water"]');
  await mouse("mousePressed", c.x, c.y);
  await sleep(1400); // the last glass
  await mouse("mouseReleased", c.x, c.y);
  await page.waitFor(`!!document.querySelector("canvas[data-confetti]")`, 3000);
});

await check(
  "Settings: four tabs (Szpila, Strażnik, Powiadomienia, Dane), remembered in the URL",
  async () => {
    await page.eval(`(${byText("a", "Ustawienia")}).click()`);
    await page.waitFor(`location.pathname === "/settings"`);
    const tabs = await page.eval<string[]>(
      `[...document.querySelectorAll("[role=tablist] [data-tab]")].map((b) => b.innerText.trim())`,
    );
    assert(tabs.join("|") === "Szpila|Strażnik|Powiadomienia|Dane", `tabs: ${tabs}`);
    assert(
      await page.eval<boolean>(
        `!!document.querySelector('[data-tab-panel="szpila"] [data-theme-option]')`,
      ),
      "theme card not in Szpila",
    );
    await page.eval(`document.querySelector('[data-tab="data"]').click()`);
    await page.waitFor(
      `location.search.includes("tab=data") && !!document.querySelector('[data-tab-panel="data"]')`,
    );
    assert(
      await page.eval<boolean>(`document.body.innerText.includes("Przywróć z pliku")`),
      "backup actions missing",
    );
    assert(
      !(await page.eval<boolean>(`!!document.querySelector('[data-tab-panel="szpila"]')`)),
      "other panels must be hidden",
    );
    await page.eval(`document.querySelector('[data-tab="notifications"]').click()`);
    await page.waitFor(
      `location.search.includes("tab=notifications") && document.body.innerText.includes("Wieczorne rozliczenie")`,
    );
    await page.goto("/settings?tab=guard");
    await page.waitFor(`!!document.querySelector('[data-tab-panel="guard"]')`, 6000);
  },
);

/** Visible elements whose own text is smaller than 12 px (SVG labels excluded). */
const tinyText = `[...document.querySelectorAll("body *")].filter((el) => !el.closest("svg") && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && el.getClientRects().length && parseFloat(getComputedStyle(el).fontSize) < 12).map((el) => el.textContent.trim().slice(0, 30) + " (" + getComputedStyle(el).fontSize + ")")`;

await check(
  "readability: no text under 12 px on Today, Raport, Szpila and Ustawienia",
  async () => {
    for (const [path, ready] of [
      ["/", "[data-status-carousel]"],
      ["/report", "[role=tablist]"],
      ["/szpila", "[data-challenge]"],
      ["/settings?tab=szpila", '[data-tab-panel="szpila"]'],
      ["/settings?tab=notifications", '[data-tab-panel="notifications"]'],
    ] as const) {
      await page.goto(path);
      await page.waitFor(`!!document.querySelector(${JSON.stringify(ready)})`, 6000);
      await sleep(900); // splash gone
      const tiny = await page.eval<string[]>(tinyText);
      assert(tiny.length === 0, `${path}: ${tiny.slice(0, 5).join(" | ")}`);
    }
  },
);

/** WCAG contrast ratio of two CSS colours (resolved through a canvas). */
const contrastJs = `(fg, bg) => { const c = document.createElement("canvas").getContext("2d"); const rgb = (col) => { c.fillStyle = "#000"; c.fillStyle = col; c.fillRect(0, 0, 1, 1); const d = c.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; }; const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); }; const a = lum(rgb(fg)), b = lum(rgb(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }`;
const mutedContrast = `(() => { const s = getComputedStyle(document.documentElement); return (${contrastJs})(s.getPropertyValue("--muted-foreground"), s.getPropertyValue("--background")); })()`;

await check("dark theme: muted text has at least 7:1 contrast", async () => {
  const ratio = await page.eval<number>(mutedContrast);
  assert(ratio >= 7, `dark muted contrast ${ratio.toFixed(2)}`);
});

await check("light theme: switch in Settings, readable, kept after a reload", async () => {
  await page.goto("/settings?tab=szpila");
  await page.waitFor(`!!document.querySelector('[data-theme-option="light"]')`, 6000);
  await page.eval(`document.querySelector('[data-theme-option="light"]').click()`);
  await page.waitFor(`document.documentElement.dataset.theme === "light"`);
  const bg = await page.eval<string>(`getComputedStyle(document.body).backgroundColor`);
  // a light background: very high contrast against black
  const vsBlack = await page.eval<number>(
    `(${contrastJs})(getComputedStyle(document.body).backgroundColor, "#000")`,
  );
  assert(vsBlack > 15, `body background not light: ${bg} (${vsBlack.toFixed(1)}:1 vs black)`);
  const ratio = await page.eval<number>(mutedContrast);
  assert(ratio >= 4.5, `light muted contrast ${ratio.toFixed(2)}`);
  const fg = await page.eval<number>(
    `(() => { const s = getComputedStyle(document.documentElement); return (${contrastJs})(s.getPropertyValue("--foreground"), s.getPropertyValue("--card")); })()`,
  );
  assert(fg >= 7, `light text on cards ${fg.toFixed(2)}`);
  // set before hydration on the next start (no dark flash)
  await page.goto("/");
  await page.waitFor(`document.readyState !== "loading"`);
  assert(
    (await page.eval<string>(`document.documentElement.dataset.theme`)) === "light",
    "light theme lost on reload",
  );
  await page.goto("/settings?tab=szpila");
  await page.waitFor(`!!document.querySelector('[data-theme-option="dark"]')`, 6000);
  await page.eval(`document.querySelector('[data-theme-option="dark"]').click()`);
  await page.waitFor(`document.documentElement.dataset.theme === "dark"`);
});

await check(
  "every theme (Glitch Pixel, AMOLED, Terminal...): readable text and muted text on Today",
  async () => {
    await page.goto("/settings?tab=szpila");
    await page.waitFor(`!!document.querySelector('[data-theme-option="glitch"]')`, 6000);
    const ids = await page.eval<string[]>(
      `[...document.querySelectorAll("[data-theme-option]")].map((e) => e.dataset.themeOption).filter((t) => t !== "system")`,
    );
    assert(ids.length >= 8 && ids.includes("glitch") && ids.includes("amoled"), `themes: ${ids}`);
    for (const id of ids) {
      await page.goto("/settings?tab=szpila");
      await page.waitFor(`!!document.querySelector('[data-theme-option="${id}"]')`, 6000);
      await page.eval(`document.querySelector('[data-theme-option="${id}"]').click()`);
      await page.waitFor(`document.documentElement.dataset.theme === "${id}"`);
      await page.goto("/");
      await page.waitFor(`!!document.querySelector("[data-tile]")`, 6000);
      assert(
        (await page.eval<string>(`document.documentElement.dataset.theme`)) === id,
        `${id} lost on reload`,
      );
      const fg = await page.eval<number>(
        `(() => { const s = getComputedStyle(document.documentElement); return (${contrastJs})(s.getPropertyValue("--foreground"), s.getPropertyValue("--card")); })()`,
      );
      assert(fg >= 7, `${id}: text on cards ${fg.toFixed(2)}`);
      const muted = await page.eval<number>(mutedContrast);
      assert(muted >= 4.5, `${id}: muted contrast ${muted.toFixed(2)}`);
    }
    // Glitch Pixel: the pixel font on headings
    await page.goto("/settings?tab=szpila");
    await page.waitFor(`!!document.querySelector('[data-theme-option="glitch"]')`, 6000);
    await page.eval(`document.querySelector('[data-theme-option="glitch"]').click()`);
    await page.goto("/");
    await page.waitFor(`!!document.querySelector("h1")`, 6000);
    const font = await page.eval<string>(
      `getComputedStyle(document.querySelector("h1")).fontFamily`,
    );
    assert(/pixelify/i.test(font), `glitch heading font: ${font}`);
    await page.goto("/settings?tab=szpila");
    await page.waitFor(`!!document.querySelector('[data-theme-option="dark"]')`, 6000);
    await page.eval(`document.querySelector('[data-theme-option="dark"]').click()`);
    await page.waitFor(`document.documentElement.dataset.theme === "dark"`);
  },
);

// ---------------------------------------------------------------- English

const POLISH_LETTERS = /[ąćęłńóśźż]/i;
/** Visible text of the page (toasts left over from the Polish part excluded). */
const pageText = `(() => { const t = document.querySelector("[data-sonner-toaster]"); if (t) t.style.display = "none"; const x = document.body.innerText; if (t) t.style.display = ""; return x; })()`;

async function noPolish(where: string): Promise<void> {
  const text = await page.eval<string>(pageText);
  const hit = text.split("\n").find((l) => POLISH_LETTERS.test(l));
  assert(!hit, `${where}: Polish text left: "${hit}"`);
}

await check(
  "Settings: switching to English translates the app and the default habits",
  async () => {
    await page.eval(`(${byText("a", "Ustawienia")}).click()`);
    await page.waitFor(`location.pathname === "/settings"`);
    await page.eval(`document.querySelector('[data-lang="en"]').click()`);
    await page.waitFor(`document.body.innerText.includes("Language")`);
    const state = await page.eval<{ language: string; names: string[] }>(
      `(() => { const s = JSON.parse(localStorage.getItem("loop-habits-v1")).state; return { language: s.language, names: s.habits.map((h) => h.name) }; })()`,
    );
    assert(state.language === "en", `language: ${state.language}`);
    assert(
      state.names.includes("Drink water") && state.names.includes("Scrolling in bed"),
      `names: ${state.names}`,
    );
    const nav = await page.eval<string>(`document.querySelector("nav").innerText`);
    assert(
      /Today/.test(nav) && /Habits/.test(nav) && /Report/.test(nav) && /Settings/.test(nav),
      `nav: ${nav}`,
    );
    await noPolish("Settings");
  },
);

await check("English: Today, Habits, Report tabs, Szpila - no Polish left", async () => {
  for (const [label, path, ready] of [
    ["Today", "/", "done"],
    ["Habits", "/habits", "Drink water"],
    ["Report", "/report", "Week"],
    ["Szpila", "/szpila", "in form"],
  ] as const) {
    await page.eval(`(${byText("a", label)}).click()`);
    await page.waitFor(`location.pathname === ${JSON.stringify(path)}`);
    await page.waitFor(`document.body.innerText.includes(${JSON.stringify(ready)})`);
    await noPolish(label);
  }
  await page.eval(`(${byText("a", "Report")}).click()`);
  await page.waitFor(`location.pathname === "/report"`);
  for (const tab of ["90 days", "Months"]) {
    await page.eval(`(${byText("button", tab)}).click()`);
    await sleep(400);
    await noPolish(`Report / ${tab}`);
  }
});

await check("English: forbidden habit sheet and Szpila's jab", async () => {
  await page.eval(`(${byText("a", "Today")}).click()`);
  await page.waitFor(`location.pathname === "/"`);
  await page.eval(`(${byText("button:not([data-focus-pick])", "Fast food")}).click()`);
  await page.waitFor(`!!(${byText("button", "Slip")})`);
  await noPolish("avoid sheet");
  assert(await page.eval<boolean>("window.__loopBack()"), "back not consumed");
});

await check("first launch: the language can be picked before the name", async () => {
  await page.eval(
    `(() => { const d = JSON.parse(localStorage.getItem("loop-habits-v1")); d.state.userName = null; d.state.language = "pl"; localStorage.setItem("loop-habits-v1", JSON.stringify(d)); })()`,
  );
  await page.goto("/");
  await page.waitFor(`document.body.innerText.includes("Witaj w Szpili")`, 6000);
  await page.eval(`document.querySelector('[role="radiogroup"] [data-lang="en"]').click()`);
  await page.waitFor(`document.body.innerText.includes("Welcome to Szpila")`);
  await page.waitFor(`JSON.parse(localStorage.getItem("loop-habits-v1")).state.language === "en"`);
});

page.close();
finish();
