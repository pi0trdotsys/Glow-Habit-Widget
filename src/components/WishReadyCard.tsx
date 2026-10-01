import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ShoppingBag } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import { wishReady, type WishItem } from "@/lib/shop";
import { L, plural } from "@/lib/i18n";

/** Wishlist items that have waited their 24 h and need a decision. */
export function useWishReady(now: Date): WishItem[] {
  const wishlist = useHabits((s) => s.wishlist);
  return useMemo(() => wishlist.filter((w) => wishReady(w, now)), [wishlist, now]);
}

/** Today's slide: "Doba minęła: kupujesz czy odpuszczasz?" -> /wishlist. */
export function WishReadyCard({ ready }: { ready: WishItem[] }) {
  if (ready.length === 0) return null;
  const names = ready
    .slice(0, 3)
    .map((w) => w.name)
    .join(", ");
  return (
    <Link
      to="/wishlist"
      data-wish-slide
      className="flex h-full items-start gap-2.5 rounded-2xl p-3"
      style={{
        background: "color-mix(in oklab, var(--primary) 10%, var(--card))",
        border: "1px solid color-mix(in oklab, var(--primary) 26%, transparent)",
      }}
    >
      <ShoppingBag size={17} className="mt-0.5 shrink-0" style={{ color: "var(--primary)" }} />
      <div className="min-w-0 text-sm leading-snug">
        <span className="font-semibold">
          {L("Doba minęła: ", "A day has passed: ")}
          {ready.length}{" "}
          {plural(
            ready.length,
            ["zachcianka", "zachcianki", "zachcianek"],
            ["craving", "cravings"],
          )}
        </span>
        <div className="truncate">{names}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {L(
            "Kupujesz czy odpuszczasz? Zdecyduj na chłodno.",
            "Buy it or let it go? Decide with a cool head.",
          )}
        </div>
      </div>
    </Link>
  );
}
