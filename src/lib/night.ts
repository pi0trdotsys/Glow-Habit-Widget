// "Rachunek za noc": what last night really looked like (social media per app
// after midnight, screen minutes, when the phone went down) + Szpila's comment.
// Numbers come from the native side (NightStats.report); the lines are mirrored
// in the widget snapshot ("bill") for the morning notification.
// Placeholders: {social} social minutes, {screen} screen minutes, {visits},
// {asleep} time the phone went down, {apps} "3× Instagram (22 min) · ...".
import type { TauntLevel } from "@/lib/habits/store";
import type { NightReport } from "@/lib/sensors";
import { formatMinute } from "@/lib/habits/utils";

const BILL: Record<TauntLevel, { bad: string[]; good: string[] }> = {
  hard: {
    bad: [
      "{social} minut social mediów po północy. Tyle kosztował cię sen. Warto było? Nie było.",
      "Powrotów do tego gówna w nocy: {visits}. Dziś wieczorem telefon ląduje poza łóżkiem.",
      "Telefon odłożony o {asleep}. A potem się dziwisz, że rano jesteś zombie.",
      "{apps}. Algorytmy się najadły, a twój sen poszedł się jebać. Brawo.",
      "Nocny rachunek: {social} min scrollowania. Zapłacisz dziś koncentracją i humorem.",
      "Tyle scrollowania po północy, a nic z tego nie pamiętasz. Dziś odkładasz to przed 24:00.",
    ],
    good: [
      "Zero social mediów po północy. Nie wierzę, ale szanuję. Powtórz to dziś.",
      "Czysta noc. Algorytm płakał, a łóżko wreszcie służyło do spania. Tak ma być.",
      "Telefon odłożony o {asleep} i żadnego scrollowania. Kot jest dumny. Trochę.",
      "Noc bez TikToków i Instagramów. Może jednak coś z ciebie będzie.",
    ],
  },
  soft: {
    bad: [
      "Po północy {social} min w social mediach. Dziś spróbuj odłożyć telefon wcześniej.",
      "Telefon odłożony ok. {asleep}. Krótsza noc = trudniejszy dzień. Dziś lepiej!",
    ],
    good: ["Czysta noc - zero social mediów po północy. Świetnie!", "Telefon odłożony o {asleep}. Dobra robota!"],
  },
};

export function billLines(level: TauntLevel, userName: string | null): { bad: string[]; good: string[] } {
  const u = (l: string) => l.replaceAll("{u}", userName || "ty");
  const b = BILL[level];
  return { bad: b.bad.map(u), good: b.good.map(u) };
}

/** "3× Instagram (22 min) · 1× YouTube (25 min)" (mirrors NightStats.appsLine). */
export function appsLine(r: NightReport): string {
  return (r.apps ?? []).map((a) => `${a.visits}× ${a.label} (${a.minutes} min)`).join(" · ");
}

/** Resolve the placeholders (mirrors NightStats.fill). */
export function fillBill(line: string, r: NightReport): string {
  return line
    .replaceAll("{social}", String(r.social ?? 0))
    .replaceAll("{screen}", String(r.screen ?? 0))
    .replaceAll("{visits}", String(r.visits ?? 0))
    .replaceAll("{asleep}", r.asleep != null && r.asleep >= 0 ? formatMinute(r.asleep) : "?")
    .replaceAll("{apps}", appsLine(r));
}

/** A bad night = any social media after midnight. */
export const badNight = (r: NightReport) => (r.social ?? 0) > 0;

/** Pick Szpila's comment for a night (deterministic per date so it doesn't flicker). */
export function billComment(r: NightReport, level: TauntLevel, userName: string | null): string {
  const pool = billLines(level, userName)[badNight(r) ? "bad" : "good"];
  const usable = r.asleep != null && r.asleep >= 0 ? pool : pool.filter((l) => !l.includes("{asleep}"));
  let h = 0;
  for (const ch of r.date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fillBill(usable[h % usable.length], r);
}
