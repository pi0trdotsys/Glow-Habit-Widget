import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { ChevronDown, Clock, ShoppingBag, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { SzpilaAvatar } from "@/components/Szpila";
import { useHabits } from "@/lib/habits/store";
import {
  SHOP_PASS_MIN,
  fmtLeft,
  fmtMoney,
  grantShopPass,
  parsePrice,
  shopLabel,
  sortWishlist,
  wishLeftMs,
  wishReady,
  wishSay,
  wishTotals,
  type WishItem,
  type WishLines,
} from "@/lib/shop";
import type { SzpilaSay } from "@/lib/habits/szpila";
import { openApp } from "@/lib/sensors";
import { L, plural } from "@/lib/i18n";

type Search = { add?: boolean; app?: string };

export const Route = createFileRoute("/wishlist")({
  // ?add=1&app=pl.allegro - from the shopping block's "Dopisz do listy (24 h)"
  validateSearch: (s: Record<string, unknown>): Search => ({
    ...(s.add === 1 || s.add === "1" || s.add === true ? { add: true } : {}),
    ...(typeof s.app === "string" && s.app ? { app: s.app } : {}),
  }),
  head: () => ({
    meta: [{ title: L("Lista 24 h - Szpila", "24-hour list - Szpila") }],
  }),
  component: WishlistPage,
});

type Say = { text: string; mood: SzpilaSay["mood"] };
/** Praise for letting go, a smirk otherwise, a scowl for buying. */
const MOOD: Record<keyof WishLines, SzpilaSay["mood"]> = {
  added: "smug",
  dropped: "impressed",
  bought: "angry",
  ready: "smug",
  empty: "smug",
};

const things = (n: number) =>
  `${n} ${plural(n, ["zachcianka", "zachcianki", "zachcianek"], ["craving", "cravings"])}`;

function WishlistPage() {
  const search = Route.useSearch();
  const wishlist = useHabits((s) => s.wishlist);
  const addWish = useHabits((s) => s.addWish);
  const decideWish = useHabits((s) => s.decideWish);
  const removeWish = useHabits((s) => s.removeWish);
  const level = useHabits((s) => s.notifications.tauntLevel);
  const guardOn = useHabits((s) => s.notifications.shopGuard);
  const passMin = useHabits((s) => s.notifications.shopPassMin) ?? SHOP_PASS_MIN;

  // The countdowns move on their own.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const fromApp = search.app;
  useEffect(() => {
    if (search.add) nameRef.current?.focus();
  }, [search.add]);

  const sorted = useMemo(() => sortWishlist(wishlist, now), [wishlist, now]);
  const ready = sorted.filter((w) => wishReady(w, now));
  const waiting = sorted.filter((w) => w.status === "waiting" && !wishReady(w, now));
  const decided = sorted.filter((w) => w.status !== "waiting");
  const totals = wishTotals(wishlist, now);

  const [say, setSayState] = useState<Say | null>(() =>
    ready.length
      ? { text: wishSay(level, "ready", ready[0].name, passMin), mood: MOOD.ready }
      : wishlist.some((w) => w.status === "waiting")
        ? null
        : { text: wishSay(level, "empty"), mood: MOOD.empty },
  );
  const setSay = (pool: keyof WishLines, itemName: string) =>
    setSayState({ text: wishSay(level, pool, itemName, passMin), mood: MOOD[pool] });
  const [showDone, setShowDone] = useState(false);

  const add = () => {
    const n = name.trim();
    if (!n) {
      nameRef.current?.focus();
      return;
    }
    addWish({ name: n, price: parsePrice(price), app: fromApp });
    setName("");
    setPrice("");
    setSay("added", n);
  };

  const drop = (w: WishItem) => {
    decideWish(w.id, "dropped");
    setSay("dropped", w.name);
  };

  const buy = async (w: WishItem) => {
    decideWish(w.id, "bought");
    setSay("bought", w.name);
    const until = await grantShopPass(passMin);
    if (until > 0) {
      toast(
        L(`Masz ${passMin} min na zakupy bez blokady.`, `${passMin} min of shopping, no block.`),
      );
      if (w.app) void openApp(w.app);
    }
  };

  return (
    <AppShell>
      <header className="px-5 pt-10 pb-4">
        <h1 className="font-display text-4xl font-bold tracking-tight">
          {L("Lista 24 h", "24-hour list")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {L(
            "Zachcianka czeka tu dobę. Potem decydujesz na chłodno: kupujesz albo odpuszczasz.",
            "A craving waits here for a day. Then you decide with a cool head: buy it or let it go.",
          )}
        </p>
      </header>

      <div className="space-y-3 px-5" data-wishlist>
        {say && (
          <section className="flex items-start gap-3 rounded-2xl bg-card p-3" data-wish-say>
            <SzpilaAvatar mood={say.mood} size={44} />
            <p className="min-w-0 text-sm leading-snug">{say.text}</p>
          </section>
        )}

        <section className="grid grid-cols-2 gap-2" data-wish-stats>
          <div className="rounded-2xl bg-card p-3">
            <div className="text-xs text-muted-foreground">{L("Uratowane", "Let go")}</div>
            <div className="mt-0.5 font-semibold">{things(totals.saved)}</div>
            {totals.savedMoney > 0 && (
              <div className="text-sm font-semibold" style={{ color: "var(--primary)" }}>
                {fmtMoney(totals.savedMoney)}
              </div>
            )}
          </div>
          <div className="rounded-2xl bg-card p-3">
            <div className="text-xs text-muted-foreground">
              {L("Kupione po namyśle", "Bought after a day")}
            </div>
            <div className="mt-0.5 font-semibold">{totals.bought}</div>
            {totals.boughtMoney > 0 && (
              <div className="text-sm text-muted-foreground">{fmtMoney(totals.boughtMoney)}</div>
            )}
          </div>
        </section>

        <form
          className="rounded-2xl bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
          data-wish-form
        >
          <div className="flex items-center gap-2 font-medium">
            <ShoppingBag size={17} style={{ color: "var(--avoid)" }} />
            {L("Dopisz zachciankę", "Write down a craving")}
            {fromApp && shopLabel(fromApp) && (
              <span className="text-xs font-normal text-muted-foreground">
                {L(`z ${shopLabel(fromApp)}`, `from ${shopLabel(fromApp)}`)}
              </span>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder={L("Co chcesz kupić?", "What do you want to buy?")}
              className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
              data-wish-name
            />
            <input
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              inputMode="decimal"
              placeholder={L("zł", "PLN")}
              aria-label={L("Cena (opcjonalnie)", "Price (optional)")}
              className="w-20 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none"
              data-wish-price
            />
          </div>
          <button
            type="submit"
            className="mt-3 w-full rounded-xl py-2.5 text-sm font-semibold"
            style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
          >
            {L("Na listę - wracam za 24 h", "On the list - back in 24 h")}
          </button>
        </form>

        {ready.length > 0 && (
          <section className="space-y-2" data-wish-ready>
            <h2 className="px-1 text-sm font-semibold">
              {L("Doba minęła - decyzja", "A day has passed - decide")}
            </h2>
            {ready.map((w) => (
              <div key={w.id} className="rounded-2xl bg-card p-3" data-wish-item={w.id}>
                <ItemHead w={w} />
                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void buy(w)}
                    className="rounded-xl border border-border py-2 text-sm font-medium"
                    data-wish-buy
                  >
                    {L("🛒 Kupuję", "🛒 Buying it")}
                  </button>
                  <button
                    onClick={() => drop(w)}
                    className="rounded-xl py-2 text-sm font-semibold"
                    style={{
                      backgroundColor: "var(--primary)",
                      color: "var(--primary-foreground)",
                    }}
                    data-wish-drop
                  >
                    {L("✋ Już nie chcę", "✋ Don't want it")}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {waiting.length > 0 && (
          <section className="space-y-2" data-wish-waiting>
            <h2 className="px-1 text-sm font-semibold">{L("Czeka", "Waiting")}</h2>
            {waiting.map((w) => (
              <div
                key={w.id}
                className="flex items-center gap-3 rounded-2xl bg-card p-3"
                data-wish-item={w.id}
              >
                <div className="min-w-0 flex-1">
                  <ItemHead w={w} />
                  <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock size={12} />
                    {fmtLeft(wishLeftMs(w, now))}
                  </div>
                </div>
                <button
                  onClick={() => drop(w)}
                  className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                  data-wish-drop
                >
                  {L("Już nie chcę", "Don't want it")}
                </button>
              </div>
            ))}
          </section>
        )}

        {decided.length > 0 && (
          <section className="rounded-2xl bg-card p-3" data-wish-history>
            <button
              type="button"
              onClick={() => setShowDone((o) => !o)}
              className="flex w-full items-center justify-between text-left text-sm font-medium"
              aria-expanded={showDone}
            >
              {L("Historia", "History")} ({decided.length})
              <ChevronDown
                size={16}
                className="transition"
                style={{ transform: showDone ? "rotate(180deg)" : undefined }}
              />
            </button>
            {showDone && (
              <ul className="mt-2 space-y-1">
                {decided.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      {w.status === "dropped" ? "✋ " : "🛒 "}
                      <span className={w.status === "dropped" ? "line-through opacity-70" : ""}>
                        {w.name}
                      </span>
                      {w.price ? (
                        <span className="text-muted-foreground"> · {fmtMoney(w.price)}</span>
                      ) : null}
                    </span>
                    <button
                      onClick={() => removeWish(w.id)}
                      aria-label={L("Usuń z historii", "Remove from history")}
                      className="shrink-0 p-1 text-muted-foreground"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {Capacitor.isNativePlatform() && !guardOn && (
          <Link
            to="/settings"
            search={{ tab: "guard" }}
            className="block rounded-2xl border border-border p-3 text-xs text-muted-foreground"
            data-wish-guard-hint
          >
            {L(
              "Włącz „Zakupy: 24 h do namysłu” w Ustawienia → Strażnik, a Szpila zasłoni sklep, zanim klikniesz „Kupuję”.",
              "Turn on “Shopping: 24 h to think it over” in Settings → Guard, and Szpila will cover the store before you tap “Buy”.",
            )}
          </Link>
        )}
      </div>
    </AppShell>
  );
}

function ItemHead({ w }: { w: WishItem }) {
  const app = shopLabel(w.app);
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{w.name}</div>
      {(w.price || app) && (
        <div className="text-xs text-muted-foreground">
          {[w.price ? fmtMoney(w.price) : "", app].filter(Boolean).join(" · ")}
        </div>
      )}
    </div>
  );
}
