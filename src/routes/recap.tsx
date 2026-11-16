import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { recapBlocks, recapDay, recaps, type Recap } from "@/lib/coach";
import { isEn, L } from "@/lib/i18n";

export const Route = createFileRoute("/recap")({
  head: () => ({ meta: [{ title: L("Podsumowania dnia - Szpila", "Day recaps - Szpila") }] }),
  component: RecapPage,
});

/**
 * "Podsumowania dnia": every evening recap in full, newest first (the notification opens this
 * screen, because some phones - HyperOS - cut a long recap in the shade). One per day; the AI
 * comment (🤖) replaces the app's own opener once it arrives.
 */
function RecapPage() {
  const [items, setItems] = useState<Recap[] | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void recaps().then(setItems);
  }, []);

  return (
    <AppShell>
      <header className="flex items-center gap-2 px-5 pt-10 pb-4">
        <Link
          to="/"
          className="-ml-2 grid h-10 w-10 place-items-center rounded-full"
          aria-label={L("Wstecz", "Back")}
        >
          <ChevronLeft size={22} />
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {L("Podsumowania dnia", "Day recaps")}
        </h1>
      </header>
      <div className="space-y-3 px-5" data-recap>
        {items === undefined ? null : items.length === 0 ? (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
            {L(
              "Jeszcze nie było podsumowania. Przyjdzie wieczorem albo wyślij próbne w Ustawienia → Powiadomienia.",
              "No recap yet. It comes in the evening, or send a test one in Settings → Notifications.",
            )}
          </p>
        ) : (
          items.map((r, i) => {
            const key = `${recapDay(r)}-${r.at}`;
            const expanded = i === 0 || open === key;
            return (
              <RecapCard
                key={key}
                recap={r}
                expanded={expanded}
                onToggle={i === 0 ? undefined : () => setOpen(expanded ? null : key)}
              />
            );
          })
        )}
      </div>
    </AppShell>
  );
}

function dayLabel(r: Recap): string {
  const day = recapDay(r);
  const d = new Date(`${day}T12:00:00`);
  const today = new Date();
  const y = new Date(today);
  y.setDate(y.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return L("Dziś", "Today");
  if (same(d, y)) return L("Wczoraj", "Yesterday");
  return d.toLocaleDateString(isEn() ? "en-US" : "pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function RecapCard({
  recap,
  expanded,
  onToggle,
}: {
  recap: Recap;
  expanded: boolean;
  onToggle?: () => void;
}) {
  const blocks = recapBlocks(recap.text);
  const time = new Date(recap.at).toLocaleTimeString(isEn() ? "en-US" : "pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <article className="rounded-2xl bg-card p-4" data-recap-day={recapDay(recap)}>
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={onToggle}
        disabled={!onToggle}
      >
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground">
            {dayLabel(recap)} · {time}
          </div>
          <div className="mt-1 text-base font-semibold">{recap.title}</div>
        </div>
        {onToggle && (
          <ChevronDown
            size={18}
            className="mt-1 shrink-0 text-muted-foreground transition-transform"
            style={{ transform: expanded ? "rotate(180deg)" : undefined }}
          />
        )}
      </button>
      {expanded ? (
        <div className="mt-3 space-y-3">
          {blocks.map((block, i) => (
            <div
              key={i}
              className={
                i === 0
                  ? "text-base leading-relaxed"
                  : "space-y-1 text-sm leading-relaxed text-muted-foreground"
              }
            >
              {block.split("\n").map((line, j) => (
                <p key={j}>{line}</p>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{blocks[0]}</p>
      )}
    </article>
  );
}
