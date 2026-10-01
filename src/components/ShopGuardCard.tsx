import { useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Link } from "@tanstack/react-router";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { Toggle } from "@/components/HabitForm";
import { useHabits } from "@/lib/habits/store";
import { liveStatus, openOverlaySettings, type LiveStatus } from "@/lib/live";
import { openUsageSettings } from "@/lib/sensors";
import {
  SHOP_APPS,
  SHOP_HOLD_S,
  SHOP_PASS_MIN,
  fmtMoney,
  hasShoppingHabit,
  lastDays,
  wishTotals,
} from "@/lib/shop";
import { refreshNative } from "@/lib/widget/bridge";
import { L, plural } from "@/lib/i18n";

const PASSES = [5, 10, 15, 30];

/**
 * Settings → Guard: "Zakupy: 24 h do namysłu". A shopping app in front gets
 * Szpila's block: the thing goes on the wishlist and waits a day.
 */
export function ShopGuardCard() {
  const notif = useHabits((s) => s.notifications);
  const setNotifications = useHabits((s) => s.setNotifications);
  const habits = useHabits((s) => s.habits);
  const wishlist = useHabits((s) => s.wishlist);
  const [st, setSt] = useState<LiveStatus | null>(null);

  useEffect(() => {
    const load = () => void liveStatus().then(setSt);
    load();
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const off = useMemo(() => new Set(notif.shopOff ?? []), [notif.shopOff]);
  if (!Capacitor.isNativePlatform()) return null;

  const on = notif.shopGuard ?? false;
  const passMin = notif.shopPassMin ?? SHOP_PASS_MIN;
  const update = (patch: Partial<typeof notif>) => {
    setNotifications({ ...notif, ...patch });
    refreshNative();
  };
  const toggleApp = (pkg: string) =>
    update({ shopOff: off.has(pkg) ? [...off].filter((p) => p !== pkg) : [...off, pkg] });

  // The phone's shopping apps (the full list until the native status arrives).
  const installed = st?.shopApps
    ? st.shopApps.filter((a) => a.installed)
    : SHOP_APPS.map((a) => ({ ...a, installed: true }));
  const blocks = lastDays(st?.shopBlocks);
  const passes = lastDays(st?.shopPasses);
  const t = wishTotals(wishlist);
  const suggest = !on && hasShoppingHabit(habits);

  return (
    <div className="rounded-2xl bg-card p-4" data-shop-guard>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShoppingBag size={18} style={{ color: "var(--avoid)" }} />
          <span className="font-medium">
            {L("Zakupy: 24 h do namysłu", "Shopping: 24 h to think it over")}
          </span>
        </div>
        <Toggle checked={on} onChange={(v) => update({ shopGuard: v })} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {L(
          `Otwierasz sklep (Allegro, Vinted, OLX…) - Szpila zasłania go od razu. Zachcianka trafia na listę i czeka dobę, bo impuls zwykle mija w kilka godzin. Kupić dalej możesz, tylko nie teraz: po 24 h „Kupuję” odblokowuje sklep na ${passMin} min. Naprawdę pilne? Przytrzymaj ${SHOP_HOLD_S} s.`,
          `Open a store (Allegro, Vinted, OLX…) and Szpila covers it at once. The craving goes on the list and waits a day, because an impulse usually fades within hours. You can still buy it, just not now: after 24 h “Buying it” unlocks the store for ${passMin} min. Really urgent? Hold for ${SHOP_HOLD_S} s.`,
        )}
      </p>

      {suggest && (
        <div
          className="mt-3 rounded-xl p-3 text-xs"
          style={{ backgroundColor: "color-mix(in oklab, var(--primary) 12%, transparent)" }}
          data-shop-suggest
        >
          {L(
            "Masz zadanie przeciw impulsywnym zakupom. Ta blokada to najprostszy sposób, żeby je trzymać.",
            "You have a habit against impulse shopping. This block is the easiest way to keep it.",
          )}
        </div>
      )}

      {on && st?.granted === false && (
        <Warn
          text={L("Wymaga „dostępu do danych o użyciu”.", "Needs “usage access”.")}
          action={L("Otwórz", "Open")}
          onClick={() => void openUsageSettings()}
        />
      )}
      {on && st?.overlay === false && (
        <Warn
          text={L(
            "Bez zgody „Wyświetlanie nad innymi aplikacjami” zostaje samo powiadomienie.",
            "Without “Display over other apps” it's just a notification.",
          )}
          action={L("Zezwól", "Allow")}
          onClick={() => void openOverlaySettings()}
        />
      )}

      {on && (
        <>
          <div className="mt-4 border-t border-border pt-3">
            <div className="text-sm font-medium">{L("Pilnowane sklepy", "Watched stores")}</div>
            <div className="mt-2 flex flex-wrap gap-1.5" data-shop-apps>
              {installed.length === 0 && (
                <span className="text-xs text-muted-foreground">
                  {L("Nie widzę tu żadnej aplikacji sklepu.", "No store apps found on this phone.")}
                </span>
              )}
              {installed.map((a) => {
                const watched = !off.has(a.pkg);
                return (
                  <button
                    key={a.pkg}
                    type="button"
                    role="checkbox"
                    aria-checked={watched}
                    onClick={() => toggleApp(a.pkg)}
                    data-shop-app={a.pkg}
                    className="rounded-full border px-2.5 py-1 text-xs font-medium"
                    style={{
                      borderColor: watched ? "var(--avoid)" : "var(--border)",
                      backgroundColor: watched
                        ? "color-mix(in oklab, var(--avoid) 14%, transparent)"
                        : "transparent",
                      opacity: watched ? 1 : 0.6,
                    }}
                  >
                    {watched ? "🛒 " : ""}
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
            <div className="min-w-0">
              <div className="text-sm font-medium">{L("Przepustka", "Pass")}</div>
              <div className="text-xs text-muted-foreground">
                {L(
                  "Ile minut zakupów daje „Kupuję” po dobie albo przytrzymanie.",
                  "How many minutes of shopping “Buying it” after a day, or the hold, gives you.",
                )}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              {PASSES.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => update({ shopPassMin: m })}
                  className="rounded-lg px-2 py-1 text-xs font-semibold"
                  style={{
                    backgroundColor:
                      m === passMin
                        ? "color-mix(in oklab, var(--primary) 18%, transparent)"
                        : "transparent",
                    color: m === passMin ? "var(--primary)" : "var(--muted-foreground)",
                  }}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {(on || wishlist.length > 0) && (
        <Link
          to="/wishlist"
          className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3"
          data-shop-wishlist-link
        >
          <div className="min-w-0 text-xs text-muted-foreground">
            <div className="text-sm font-medium text-foreground">
              {L("Lista 24 h", "24-hour list")}
            </div>
            {L(
              `Ten tydzień: ${blocks}× blokada, ${passes}× przytrzymanie. Uratowane: ${t.saved} ${plural(t.saved, ["zachcianka", "zachcianki", "zachcianek"], ["craving", "cravings"])}`,
              `This week: ${blocks}× blocked, ${passes}× held through. Let go: ${t.saved} ${plural(t.saved, ["zachcianka", "zachcianki", "zachcianek"], ["craving", "cravings"])}`,
            )}
            {t.savedMoney > 0 ? ` · ${fmtMoney(t.savedMoney)}` : ""}
            {t.waiting + t.ready > 0
              ? L(` · czeka: ${t.waiting + t.ready}`, ` · waiting: ${t.waiting + t.ready}`)
              : ""}
          </div>
          <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
        </Link>
      )}
    </div>
  );
}

function Warn({ text, action, onClick }: { text: string; action: string; onClick: () => void }) {
  return (
    <div
      className="mt-3 flex items-center justify-between gap-3 rounded-xl p-3"
      style={{ backgroundColor: "color-mix(in oklab, var(--avoid) 14%, transparent)" }}
    >
      <span className="text-xs">{text}</span>
      <button
        onClick={onClick}
        className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
        style={{ backgroundColor: "var(--avoid)", color: "var(--primary-foreground)" }}
      >
        {action}
      </button>
    </div>
  );
}
