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
  await page.goto("/");
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
  await page.eval(`(${byText("button", "Fast food")}).click()`);
  await page.waitFor(`!!(${byText("button", "Czysto")})`);
  await page.eval(
    `[...document.querySelectorAll("button")].find(e => e.textContent.trim().endsWith("Czysto")).click()`,
  );
  await page.waitFor(`(${byText("button", "Fast food")}).textContent.includes("✓")`);
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
  await page.eval(`(${byText("button", "Fast food")}).click()`);
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
    await page.eval(`(${byText("button", "Fast food")}).click()`);
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
  await page.eval(`(${byText("button", "Fast food")}).click()`);
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
  // last nights from the night bill
  await page.waitFor(`!!document.querySelector("[data-night-list]")`);
  const nights = await page.eval<string>(`document.querySelector("[data-night-list]").innerText`);
  assert(
    nights.includes("3× Instagram · 22 min") && nights.includes("01:40"),
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

page.close();
finish();
