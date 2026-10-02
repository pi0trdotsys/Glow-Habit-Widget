import { useEffect, useState } from "react";
import { GlassWater } from "lucide-react";
import { useHabits } from "@/lib/habits/store";
import { amountText, amountOn } from "@/lib/habits/utils";
import { L } from "@/lib/i18n";
import {
  isKropi,
  kropiDays,
  kropiStatus,
  unlinkedWaterHabits,
  type KropiDay,
  type KropiStatus,
} from "@/lib/kropi";
import { syncKropiNow } from "@/lib/sensors";

/**
 * Settings → Auto-tracking: water from Kropi. Link a water habit once, then
 * log only in Kropi - today's ml, Kropi's goal and the last days come over.
 */
export function KropiSource({ onMessage }: { onMessage: (m: string) => void }) {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  const linkKropi = useHabits((s) => s.linkKropi);
  const unlinkKropi = useHabits((s) => s.unlinkKropi);
  const [st, setSt] = useState<KropiStatus | null>(null);
  const [today, setToday] = useState<KropiDay | null>(null);

  const refresh = () => {
    void kropiStatus().then(setSt);
    void kropiDays().then((d) => setToday(d[0] ?? null));
  };
  useEffect(() => {
    refresh();
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      refresh();
      void syncKropiNow();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  if (!st?.installed) return null;
  const linked = habits.filter(isKropi);
  const unlinked = unlinkedWaterHabits(habits);

  return (
    <div className="mt-4 flex items-start gap-3" data-kropi>
      <GlassWater size={18} className="mt-0.5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{L("Woda z Kropi", "Water from Kropi")}</div>
        <div className="text-xs text-muted-foreground">
          {!st.granted
            ? L(
                "Kropi jest, ale nie udostępnia danych. Zaktualizuj Kropi do wersji 1.6, a potem Szpilę.",
                "Kropi is installed but doesn't share its data. Update Kropi to 1.6, then Szpila.",
              )
            : today
              ? L(
                  `Połączono · dziś w Kropi: ${today.ml} ml`,
                  `Connected · today in Kropi: ${today.ml} ml`,
                )
              : L("Połączono · dziś jeszcze nic w Kropi", "Connected · nothing in Kropi today yet")}
        </div>
        {st.granted &&
          unlinked.map((h) => (
            <div key={h.id} className="mt-2 flex items-center gap-3" data-kropi-link={h.id}>
              <div className="min-w-0 flex-1 text-xs">
                <span className="font-semibold">„{h.name}”</span>{" "}
                {L(
                  "wpisujesz ręcznie. Niech woda z Kropi wpisuje się sama.",
                  "is typed in by hand. Let Kropi fill it in.",
                )}
              </div>
              <button
                onClick={async () => {
                  linkKropi(h.id, await kropiDays());
                  onMessage(
                    L(
                      `„${h.name}” liczy teraz wodę z Kropi. Wpisuj ją tylko tam.`,
                      `“${h.name}” now counts water from Kropi. Log it only there.`,
                    ),
                  );
                }}
                className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ backgroundColor: "var(--primary)", color: "var(--primary-foreground)" }}
              >
                {L("Podłącz", "Link")}
              </button>
            </div>
          ))}
        {linked.map((h) => (
          <div key={h.id} className="mt-2 flex items-center gap-3" data-kropi-linked={h.id}>
            <div className="min-w-0 flex-1 text-xs">
              💧 <span className="font-semibold">„{h.name}”</span> {L("z Kropi", "from Kropi")} ·{" "}
              {amountText(h, amountOn(h, completions, new Date()))}
            </div>
            <button
              onClick={() => unlinkKropi(h.id)}
              className="shrink-0 rounded-full border border-border px-3 py-1.5 text-xs font-semibold"
            >
              {L("Odłącz", "Unlink")}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
