// "24 h do namysłu" - a cooling-off period for shopping apps (against the
// avoid habit "Impulsywne wydawanie"). With the guard on, opening a shopping
// app brings up Szpila's full-screen block (LiveGuardService.shopBlock):
//  - "Dopisz do listy (24 h)" opens Szpila on /wishlist - the thing waits a day;
//  - "Wychodzę" goes to the home screen;
//  - holding 20 s gives a short pass ("konieczny zakup", passMin minutes).
// After 24 h a wishlist item is ready: "Kupuję" grants a pass (no block for
// passMin minutes), "Już nie chcę" counts as saved money. Why it works: the
// urge to buy fades within hours, a delay turns an impulse into a decision,
// and the saved total makes letting go feel like a win.
// Block placeholders (resolved natively, ShopGuard.fill): {app} {time}
// {count} (blocks today) {min} (pass minutes).
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { NotificationSettings, TauntLevel } from "@/lib/habits/store";
import type { Habit } from "@/lib/habits/types";
import { categoryOf } from "@/lib/habits/szpila";
import { kindOf, todayKey } from "@/lib/habits/utils";
import { L, pick } from "@/lib/i18n";

/** Watched shopping apps (no grocery apps). Mirrors ShopGuard.SHOP in Java. */
export const SHOP_APPS: { pkg: string; label: string }[] = [
  { pkg: "pl.allegro", label: "Allegro" },
  { pkg: "pl.allegro.sale", label: "Allegro Lokalnie" },
  { pkg: "com.alibaba.aliexpresshd", label: "AliExpress" },
  { pkg: "com.einnovation.temu", label: "Temu" },
  { pkg: "com.zzkko", label: "Shein" },
  { pkg: "com.amazon.mShop.android.shopping", label: "Amazon" },
  { pkg: "fr.vinted", label: "Vinted" },
  { pkg: "pl.tablica", label: "OLX" },
  { pkg: "de.zalando.mobile", label: "Zalando" },
  { pkg: "pl.xkom", label: "x-kom" },
  { pkg: "com.hm.goe", label: "H&M" },
  { pkg: "com.inditex.zara", label: "Zara" },
  { pkg: "com.action.consumerapp", label: "Action" },
  { pkg: "eu.pepco.app", label: "Pepco" },
  { pkg: "com.ebay.mobile", label: "eBay" },
  { pkg: "com.contextlogic.wish", label: "Wish" },
  { pkg: "pl.ceneo", label: "Ceneo" },
  { pkg: "pl.com.rossmann.centauros", label: "Rossmann" },
];

/** A wishlist item waits this long before it can be bought. */
export const WISH_WAIT_MS = 24 * 60 * 60_000;
/** Mirrors ShopGuard.PASS_MIN_DEFAULT / HOLD_MS. */
export const SHOP_PASS_MIN = 15;
export const SHOP_HOLD_S = 20;

export const shopLabel = (pkg: string | undefined) =>
  (pkg && SHOP_APPS.find((a) => a.pkg === pkg)?.label) || "";

// ---------------------------------------------------------------- the wishlist

export type WishStatus = "waiting" | "bought" | "dropped";

export interface WishItem {
  id: string;
  name: string;
  /** Price in zł (optional). */
  price?: number;
  /** ISO time it went on the list. */
  addedAt: string;
  status: WishStatus;
  /** ISO time of "Kupuję" / "Już nie chcę". */
  decidedAt?: string;
  /** The shopping app it came from (the block's "add to the list"). */
  app?: string;
}

/** When an item may be bought (24 h after it went on the list). */
export const wishReadyAt = (w: WishItem) => new Date(w.addedAt).getTime() + WISH_WAIT_MS;

/** Waited the full 24 h and still undecided. */
export const wishReady = (w: WishItem, now: Date = new Date()) =>
  w.status === "waiting" && now.getTime() >= wishReadyAt(w);

/** Time left until it's ready, ms (0 = ready). */
export const wishLeftMs = (w: WishItem, now: Date = new Date()) =>
  Math.max(0, wishReadyAt(w) - now.getTime());

/** "jeszcze 17 h" / "jeszcze 40 min" - rounded up, so it never says 0 while still waiting. */
export function fmtLeft(ms: number): string {
  if (ms <= 0) return L("gotowe", "ready");
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return L(`jeszcze ${min} min`, `${min} min to go`);
  const h = Math.ceil(min / 60);
  return L(`jeszcze ${h} h`, `${h} h to go`);
}

/** Money in the app's language: "420 zł" / "420 PLN". */
export const fmtMoney = (zl: number) =>
  L(`${Math.round(zl)} zł`, `${Math.round(zl)} PLN`).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export interface WishTotals {
  waiting: number;
  ready: number;
  /** Let go ("Już nie chcę") - count and money. */
  saved: number;
  savedMoney: number;
  /** Bought after waiting. */
  bought: number;
  boughtMoney: number;
}

export function wishTotals(list: WishItem[], now: Date = new Date()): WishTotals {
  const t: WishTotals = {
    waiting: 0,
    ready: 0,
    saved: 0,
    savedMoney: 0,
    bought: 0,
    boughtMoney: 0,
  };
  for (const w of list) {
    if (w.status === "waiting") {
      if (wishReady(w, now)) t.ready++;
      else t.waiting++;
    } else if (w.status === "dropped") {
      t.saved++;
      t.savedMoney += w.price ?? 0;
    } else {
      t.bought++;
      t.boughtMoney += w.price ?? 0;
    }
  }
  return t;
}

/** Ready first (oldest first), then waiting (soonest first), then the decided ones (newest first). */
export function sortWishlist(list: WishItem[], now: Date = new Date()): WishItem[] {
  const rank = (w: WishItem) => (wishReady(w, now) ? 0 : w.status === "waiting" ? 1 : 2);
  return [...list].sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    if (rank(a) === 2) return (b.decidedAt ?? "").localeCompare(a.decidedAt ?? "");
    return a.addedAt.localeCompare(b.addedAt);
  });
}

/** A price typed by hand ("49,99", "120 zł") -> zł, or undefined. */
export function parsePrice(raw: string): number | undefined {
  const n = Number(raw.replace(/\s|zł|pln/gi, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : undefined;
}

/** Backups / old saves: keep only well-formed items. */
export function normalizeWishlist(raw: unknown): WishItem[] {
  if (!Array.isArray(raw)) return [];
  const ok: WishStatus[] = ["waiting", "bought", "dropped"];
  return raw
    .filter(
      (w): w is WishItem =>
        !!w &&
        typeof w.id === "string" &&
        typeof w.name === "string" &&
        typeof w.addedAt === "string" &&
        !Number.isNaN(new Date(w.addedAt).getTime()),
    )
    .map((w) => ({
      id: w.id,
      name: w.name,
      addedAt: w.addedAt,
      status: ok.includes(w.status) ? w.status : "waiting",
      ...(typeof w.price === "number" && w.price > 0 ? { price: w.price } : {}),
      ...(typeof w.decidedAt === "string" ? { decidedAt: w.decidedAt } : {}),
      ...(typeof w.app === "string" && w.app ? { app: w.app } : {}),
    }));
}

/** Sum of a per-day counter over the last `days` days (today included). */
export function lastDays(
  counts: Record<string, number> | undefined,
  days = 7,
  now: Date = new Date(),
): number {
  if (!counts) return 0;
  let n = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    n += counts[todayKey(d)] ?? 0;
  }
  return n;
}

/** An avoid habit about shopping ("Impulsywne wydawanie") - the guard is suggested then. */
export const hasShoppingHabit = (habits: Habit[]) =>
  habits.some((h) => kindOf(h) === "avoid" && categoryOf(h) === "shopping");

// ---------------------------------------------------------------- lines

export type ShopLines = { shop: string[]; shopPass: string[] };
export type WishLines = {
  added: string[];
  dropped: string[];
  bought: string[];
  ready: string[];
  empty: string[];
};

const PL: Record<TauntLevel, ShopLines & WishLines> = {
  hard: {
    shop: [
      "{app} o {time}? Karta już się poci. 24 h do namysłu, potem pogadamy.",
      "Kolejna rzecz, bez której żyło ci się świetnie do wczoraj. Dopisz ją do listy i wróć jutro.",
      "Kurwa, znowu {app}. Dopisz to do listy. Jak za dobę dalej będzie ci się chciało, kupisz bez gadania.",
      "Promocja kończy się za dwie godziny? Ściema. Zawsze się kończy i zawsze wraca.",
      "Kurier zna już twoje imię, a sąsiedzi myślą, że prowadzisz hurtownię. Zamykaj {app}.",
      "Koszyk pełny, konto puste. Klasyka gatunku. Daj temu dobę.",
      "Nie potrzebujesz tego. Chcesz tego przez jakieś piętnaście minut. Jutro nawet nie będziesz pamiętać.",
      "{app} o {time} to nie zakupy, to nuda z kartą płatniczą. Odkładaj, kurwa.",
      "Szafa pęka, szuflady pękają, a ty dalej w {app}. Doba przerwy, zanim cokolwiek kupisz.",
      "Darmowa dostawa od 99 zł to pułapka. Nie dorzucaj gówna do koszyka, żeby zaoszczędzić 9,99.",
      "{count}. raz dziś w {app}. Algorytm sklepu ma cię na widelcu. Wyjdź z tego.",
      "Dopamina z „Kupuję i płacę” trwa minutę. Rata trwa miesiąc. Zamykaj {app}.",
      "Ta rzecz będzie tam jutro. A jak nie będzie, to znaczy, że nie była ci pisana, kurwa.",
      "Zachcianka to nie potrzeba. Dopisz do listy, prześpij się z tym, jutro zdecydujesz.",
      "Paczkomat już się z ciebie śmieje. Doba przerwy, bez dyskusji.",
      "Kupowanie na smutno, z nudów i o {time} - każde z tych trzech to chujowy pomysł. Lista i wychodzisz.",
      "W domu leżą rzeczy z metkami, a ty szukasz nowych w {app}. Pojebało?",
      "„Tylko popatrzę” - powiedział każdy przed wydaniem trzystu złotych. Zamykaj {app}.",
      "Twoje konto wzywa pomocy. Pomoc przyszła: kot. Dopisz to do listy.",
      "Nikt na łożu śmierci nie żałuje, że nie kupił piątego kubka. Daj sobie 24 h.",
    ],
    shopPass: [
      "Dobra, {min} min na konieczny zakup. Konieczny, a nie „bo promocja”.",
      "Masz {min} min. Kupujesz to, po co tu wchodzisz, i wychodzisz. Nic ekstra do koszyka, kurwa.",
      "{min} minut w {app}. Zegar tyka, a ja patrzę na koszyk.",
      "Konieczny zakup, {min} min. Jak w koszyku wyląduje coś z promocji, to wiem, że mnie oszukujesz.",
    ],
    added: [
      "„{name}” na liście. Zegar tyka: 24 h. Jak jutro dalej będzie ci się chciało, pogadamy.",
      "Zapisane. Zobaczymy, czy jutro „{name}” będzie dalej takie niezbędne, kurwa.",
      "„{name}” czeka w kolejce. Najlepsza zachcianka to przeczekana zachcianka.",
      "Dopisane. Sklep na razie zarabia zero złotych. Piękny widok.",
    ],
    dropped: [
      "„{name}” wylatuje z listy. Portfel przybija ci piątkę.",
      "Brawo. To było potrzebne przez jakieś pięć minut. Kasa zostaje u ciebie, kurwa!",
      "Kolejna uratowana kasa. Kot jest pod wrażeniem, a to rzadkie.",
      "Nie kupujesz „{name}”. Szanuję. Tak się wygrywa z algorytmem.",
      "Odpuszczone. Zachcianka zdechła po dobie, jak zawsze. Pieniądze zostają.",
    ],
    bought: [
      "Doba minęła, a ty dalej chcesz „{name}”? Dobra, kupuj. Przynajmniej to nie był impuls.",
      "24 h przeczekane, więc „{name}” możesz kupić bez wstydu. Prawie bez wstydu, kurwa.",
      "Masz {min} min na „{name}”. Tylko to jedno, a nie pół sklepu.",
      "„{name}” przeszło test doby. Kupuj, ale jak dorzucisz coś jeszcze, to się dowiem.",
    ],
    ready: [
      "Doba minęła. Dalej chcesz „{name}”, czy to była tylko nuda?",
      "„{name}” odczekało swoje. Decyzja: kupujesz czy odpuszczasz?",
      "24 h za nami. Serce mówi „{name}”, a konto mówi „spierdalaj”. Kogo posłuchasz?",
    ],
    empty: [
      "Lista pusta. Następna zachcianka trafi tutaj, zanim trafi do koszyka.",
      "Nic nie czeka. Albo nic nie kusi, albo ukrywasz przede mną koszyk. Widzę wszystko.",
    ],
  },
  soft: {
    shop: [
      "{app}? Daj sobie 24 h do namysłu. Jeśli jutro dalej będzie ci się chciało, kupisz spokojnie.",
      "Zachcianki zwykle mijają w ciągu doby. Dopisz to do listy i wróć jutro.",
      "{app} o {time}? Dobry moment na przerwę od zakupów.",
      "Lista życzeń poczeka. Portfel podziękuje.",
      "Najlepsze zakupy to te przemyślane. Dopisz do listy, zdecydujesz jutro.",
    ],
    shopPass: [
      "Masz {min} min na konieczny zakup. Kupuj tylko to, co trzeba.",
      "Dobrze, {min} min. Udanych zakupów!",
    ],
    added: [
      "„{name}” na liście. Wróć za 24 h i zdecyduj na spokojnie.",
      "Zapisane. Jutro sprawdzimy, czy dalej tego chcesz.",
    ],
    dropped: [
      "Odpuszczone - pieniądze zostają u ciebie. Świetnie!",
      "„{name}” znika z listy. Dobra decyzja.",
    ],
    bought: [
      "Doba minęła i dalej chcesz „{name}”. To przemyślany zakup!",
      "Masz {min} min na zakupy. Udanych!",
    ],
    ready: ["„{name}” odczekało dobę. Kupujesz czy odpuszczasz?"],
    empty: ["Lista pusta. Następną zachciankę zapisz tutaj."],
  },
};

const EN: Record<TauntLevel, ShopLines & WishLines> = {
  hard: {
    shop: [
      "{app} at {time}? Your card is already sweating. 24 h to think it over, then we'll talk.",
      "Another thing you lived just fine without until yesterday. Put it on the list and come back tomorrow.",
      "Damn it, {app} again. Put it on the list. If you still want it in a day, you can buy it, no argument.",
      "The sale ends in two hours? They're lying. It always ends and it always comes back.",
      "The courier knows your name and the neighbors think you run a warehouse. Close {app}.",
      "Full cart, empty account. A true classic. Give it a day.",
      "You don't need it. You want it for about fifteen minutes. Tomorrow you won't even remember.",
      "{app} at {time} isn't shopping, it's boredom with a credit card. Put it down, damn it.",
      "The closet is bursting, the drawers are bursting, and you're still on {app}. A day's break before you buy anything.",
      "Free shipping over 99 is a trap. Don't throw crap in the cart to save 9.99.",
      "Visit #{count} to {app} today. The store's algorithm has you on a hook. Get out.",
      "The rush from “Buy now” lasts a minute. The installment lasts a month. Close {app}.",
      "It'll still be there tomorrow. And if it isn't, it just wasn't meant to be, damn it.",
      "A craving isn't a need. Put it on the list, sleep on it, decide tomorrow.",
      "The parcel locker is laughing at you already. A day's break, no discussion.",
      "Sad shopping, bored shopping and {time} shopping - all three are shitty ideas. The list, and out you go.",
      "There are things with tags still on them at home and you're hunting for new ones on {app}. Are you fucking kidding me?",
      "“I'm just looking” - said everyone right before spending a fortune. Close {app}.",
      "Your bank account just called for help. I came. Well, the cat did. Put it on the list.",
      "Nobody on their deathbed regrets not buying a fifth mug. Give it 24 h.",
    ],
    shopPass: [
      "Fine, {min} min for a must-buy. A must, not “because it's on sale”.",
      "You've got {min} min. Buy what you came for and get out. Nothing extra in the cart, damn it.",
      "{min} minutes on {app}. The clock is ticking and I'm watching the cart.",
      "A must-buy, {min} min. If something on sale lands in the cart, I'll know you lied to me.",
    ],
    added: [
      "“{name}” is on the list. The clock is ticking: 24 h. If you still want it tomorrow, we'll talk.",
      "Saved. Let's see if “{name}” is still so essential tomorrow, damn it.",
      "“{name}” is waiting in line. The best craving is one you waited out.",
      "Written down. For now the store is making zero. Beautiful sight.",
    ],
    dropped: [
      "“{name}” is off the list. Your wallet just high-fived you.",
      "Bravo. You needed that for about five minutes. The money stays with you, damn it!",
      "More money saved. The cat is impressed, and that's rare.",
      "You're not buying “{name}”. Respect. That's how you beat the algorithm.",
      "Let go. The craving died after a day, as always. The money stays.",
    ],
    bought: [
      "A day went by and you still want “{name}”? Fine, buy it. At least it wasn't an impulse.",
      "24 h waited out, so you can buy “{name}” without shame. Almost without shame, damn it.",
      "You've got {min} min for “{name}”. Just that one thing, not half the store.",
      "“{name}” passed the one-day test. Buy it, but if you add anything else, I'll find out.",
    ],
    ready: [
      "A day went by. Do you still want “{name}”, or was it just boredom?",
      "“{name}” has waited its turn. Decision time: buy it or let it go?",
      "24 h are up. Your heart says “{name}”, your account says “fuck off”. Who do you listen to?",
    ],
    empty: [
      "The list is empty. The next craving lands here before it lands in a cart.",
      "Nothing waiting. Either nothing tempts you, or you're hiding a cart from me. I see everything.",
    ],
  },
  soft: {
    shop: [
      "{app}? Give yourself 24 h to think it over. If you still want it tomorrow, buy it calmly.",
      "Cravings usually fade within a day. Put it on the list and come back tomorrow.",
      "{app} at {time}? A good moment for a break from shopping.",
      "The wishlist can wait. Your wallet will thank you.",
      "The best purchases are the thought-through ones. Put it on the list and decide tomorrow.",
    ],
    shopPass: [
      "You've got {min} min for a must-buy. Only what you need.",
      "Okay, {min} min. Happy shopping!",
    ],
    added: [
      "“{name}” is on the list. Come back in 24 h and decide calmly.",
      "Saved. Tomorrow we'll check whether you still want it.",
    ],
    dropped: ["Let go - the money stays with you. Great!", "“{name}” is off the list. Good call."],
    bought: [
      "A day went by and you still want “{name}”. That's a thought-through purchase!",
      "You've got {min} min to shop. Enjoy!",
    ],
    ready: ["“{name}” has waited a day. Buy it or let it go?"],
    empty: ["The list is empty. Write the next craving down here."],
  },
};

/** Lines for the native block + pass note (snapshot live.lines.shop / shopPass). */
export function shopLines(level: TauntLevel): ShopLines {
  const l = pick(PL, EN)[level];
  return { shop: l.shop, shopPass: l.shopPass };
}

/** Szpila's comments on the wishlist screen ({name}, {min}). */
export function wishLines(level: TauntLevel): WishLines {
  const l = pick(PL, EN)[level];
  return { added: l.added, dropped: l.dropped, bought: l.bought, ready: l.ready, empty: l.empty };
}

/** One random comment with {name} / {min} filled in. */
export function wishSay(
  level: TauntLevel,
  pool: keyof WishLines,
  name = "",
  min = SHOP_PASS_MIN,
  rnd: () => number = Math.random,
): string {
  const lines = wishLines(level)[pool];
  const line = lines[Math.floor(rnd() * lines.length)] ?? "";
  return line.replaceAll("{name}", name).replaceAll("{min}", String(min));
}

// ---------------------------------------------------------------- snapshot

/** The `shop` part of the snapshot's `live` object (ShopGuard.settings in Java). */
export function shopState(n: NotificationSettings, wishlist: WishItem[], now: Date = new Date()) {
  const t = wishTotals(wishlist, now);
  return {
    enabled: n.shopGuard ?? false,
    off: n.shopOff ?? [],
    passMin: n.shopPassMin ?? SHOP_PASS_MIN,
    waiting: t.waiting,
    ready: t.ready,
    saved: t.saved,
    savedMoney: Math.round(t.savedMoney),
  };
}

// ---------------------------------------------------------------- native

interface ShopPlugin {
  shopPass(opts: { minutes: number }): Promise<{ until: number }>;
  pendingRoute(): Promise<{ route: string }>;
}
const Native = registerPlugin<ShopPlugin>("HabitWidget");

/** "Kupuję": no shopping block for `minutes`. Returns the pass end (ms) or 0 outside the app. */
export async function grantShopPass(minutes: number): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  try {
    return (await Native.shopPass({ minutes })).until;
  } catch {
    return 0;
  }
}

/** A screen the native side asked to open (e.g. "/wishlist?add=1&app=pl.allegro"), once. */
export async function takePendingRoute(): Promise<string> {
  if (!Capacitor.isNativePlatform()) return "";
  try {
    const r = (await Native.pendingRoute()).route ?? "";
    // Only our own screens.
    return r.startsWith("/") && !r.startsWith("//") ? r : "";
  } catch {
    return "";
  }
}
