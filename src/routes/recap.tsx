import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { lastRecap, type Recap } from "@/lib/coach";
import { isEn, L } from "@/lib/i18n";

export const Route = createFileRoute("/recap")({
  head: () => ({ meta: [{ title: L("Podsumowanie dnia - Szpila", "Day recap - Szpila") }] }),
  component: RecapPage,
});

/**
 * "Podsumowanie dnia" in full: the notification opens this screen, because on some phones
 * (HyperOS) a long recap gets cut in the notification shade.
 */
function RecapPage() {
  const [recap, setRecap] = useState<Recap | null | undefined>(undefined);
  useEffect(() => {
    void lastRecap().then(setRecap);
  }, []);

  const when = (ms: number) =>
    new Date(ms).toLocaleString(isEn() ? "en-US" : "pl-PL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <AppShell>
      <header className="flex items-center gap-2 px-5 pt-10 pb-4">
        <Link
          to="/"
          className="-ml-2 grid h-10 w-10 place-items-center rounded-full"
          aria-label="Back"
        >
          <ChevronLeft size={22} />
        </Link>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {L("Podsumowanie dnia", "Day recap")}
        </h1>
      </header>
      <div className="px-5" data-recap>
        {recap === undefined ? null : recap === null ? (
          <p className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
            {L(
              "Jeszcze nie było podsumowania. Przyjdzie wieczorem albo wyślij próbne w Ustawienia → Powiadomienia.",
              "No recap yet. It comes in the evening, or send a test one in Settings → Notifications.",
            )}
          </p>
        ) : (
          <article className="rounded-2xl bg-card p-4">
            <div className="text-lg font-semibold">{recap.title}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{when(recap.at)}</div>
            <div className="mt-4 space-y-3">
              {recap.text.split(/\n\s*\n/).map((block, i) => (
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
          </article>
        )}
      </div>
    </AppShell>
  );
}
