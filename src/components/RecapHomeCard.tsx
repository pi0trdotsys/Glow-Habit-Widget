import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { homeRecap, recapBlocks, recaps, type Recap } from "@/lib/coach";
import { L } from "@/lib/i18n";

/**
 * "Dziś": the evening recap (with the AI comment 🤖) from tonight, or last night's until noon -
 * a tap opens all of them (/recap). Nothing when there's none (or outside the native app).
 */
export function RecapHomeCard() {
  const [recap, setRecap] = useState<Recap | null>(null);
  useEffect(() => {
    const load = () => void recaps().then((items) => setRecap(homeRecap(items, new Date())));
    load();
    // the recap (and its AI comment a minute later) arrives while the app sits in the background
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  if (!recap) return null;
  const [lead, tip] = recapBlocks(recap.text);
  return (
    <Link to="/recap" className="block rounded-2xl bg-card p-4" data-recap-home>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold">{recap.title}</div>
        <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
      </div>
      <p className="mt-2 line-clamp-4 text-sm leading-relaxed">{lead}</p>
      {tip && tip.startsWith("💡") && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">{tip}</p>
      )}
      <div className="mt-2 text-xs font-medium text-primary">
        {L("Całe podsumowanie i poprzednie →", "Full recap and earlier ones →")}
      </div>
    </Link>
  );
}
