// "Rachunek za noc": what last night really looked like (social media per app
// after midnight, screen minutes, when the phone went down) + Szpila's comment.
// Numbers come from the native side (NightStats.report); the lines are mirrored
// in the widget snapshot ("bill") for the morning notification.
// Placeholders: {social} social minutes, {screen} screen minutes, {visits},
// {asleep} time the phone went down, {apps} "3× Instagram (22 min) · ...".
import type { TauntLevel } from "@/lib/habits/store";
import type { NightReport } from "@/lib/sensors";
import { formatMinute } from "@/lib/habits/utils";
import { L, pick } from "@/lib/i18n";

const BILL: Record<TauntLevel, { bad: string[]; good: string[] }> = {
  hard: {
    bad: [
      "{social} minut social mediów po północy. Tyle kosztował cię sen. Warto było? Nie było.",
      "Powrotów do tego gówna w nocy: {visits}. Dziś wieczorem telefon ląduje poza łóżkiem.",
      "Telefon odłożony o {asleep}. A potem się dziwisz, że rano jesteś zombie.",
      "{apps}. Algorytmy się najadły, a twój sen poszedł się jebać. Brawo.",
      "Nocny rachunek: {social} min scrollowania. Zapłacisz dziś koncentracją i humorem.",
      "Tyle scrollowania po północy, a nic z tego nie pamiętasz. Dziś odkładasz to przed 24:00.",
      "{social} min social mediów po północy. Sen poszedł się jebać, a ty nawet nie pamiętasz po co.",
      "Nocne wejścia w social media: {visits}. Dziś telefon śpi w kuchni, kurwa.",
      "{screen} min ekranu w nocy. Oczy wyglądają dziś jak dwie dziury w śniegu.",
      "Rachunek za noc: {apps}. Zapłacone snem, gotówki nie przyjmujemy.",
    ],
    good: [
      "Zero social mediów po północy. Nie wierzę, ale szanuję. Powtórz to dziś.",
      "Czysta noc. Algorytm płakał, a łóżko wreszcie służyło do spania. Tak ma być.",
      "Telefon odłożony o {asleep} i żadnego scrollowania. Kot jest dumny. Trochę.",
      "Noc bez TikToków i Instagramów. Może jednak coś z ciebie będzie.",
      "Czysta noc. Telefon spał osobno, łóżko służyło do spania. Kurwa, tak trzymaj.",
      "Zero scrollowania po północy. Algorytm głodny, a sen wygrany. Szanuję.",
      "Telefon odłożony o {asleep}. Rano widać to na twarzy. Dobra robota.",
    ],
  },
  soft: {
    bad: [
      "Po północy {social} min w social mediach. Dziś spróbuj odłożyć telefon wcześniej.",
      "Telefon odłożony ok. {asleep}. Krótsza noc = trudniejszy dzień. Dziś lepiej!",
      "Po północy {social} min w telefonie. Dziś spróbuj zostawić go poza sypialnią.",
    ],
    good: [
      "Czysta noc - zero social mediów po północy. Świetnie!",
      "Telefon odłożony o {asleep}. Dobra robota!",
      "Spokojna noc bez social mediów. Brawo!",
    ],
  },
};

const BILL_EN: Record<TauntLevel, { bad: string[]; good: string[] }> = {
  hard: {
    bad: [
      "{social} minutes of social media after midnight. That's what your sleep cost. Worth it? It wasn't.",
      "Times you went back to that shit overnight: {visits}. Tonight the phone stays out of bed.",
      "Phone down at {asleep}. And then you wonder why you're a zombie in the morning.",
      "{apps}. The algorithms feasted and your sleep got fucked. Bravo.",
      "Night bill: {social} min of scrolling. You'll pay for it today in focus and mood.",
      "All that scrolling after midnight and you remember none of it. Tonight it goes down before 12.",
      "{social} min of social media after midnight. Your sleep got fucked and you don't even remember what for.",
      "Social media visits overnight: {visits}. Tonight the phone sleeps in the kitchen, damn it.",
      "{screen} min of screen at night. Your eyes look like two holes in the snow today.",
      "Night bill: {apps}. Paid in sleep, no cash accepted.",
    ],
    good: [
      "Zero social media after midnight. I don't believe it, but respect. Do it again tonight.",
      "A clean night. The algorithm cried and the bed was finally used for sleeping. As it should be.",
      "Phone down at {asleep} and no scrolling. The cat is proud. A little.",
      "A night without TikTok and Instagram. Maybe you'll amount to something after all.",
      "A clean night. The phone slept alone and the bed was used for sleeping. Damn, keep it up.",
      "Zero scrolling after midnight. The algorithm went hungry and sleep won. Respect.",
      "Phone down at {asleep}. It shows on your face this morning. Good job.",
    ],
  },
  soft: {
    bad: [
      "{social} min on social media after midnight. Try putting the phone down earlier tonight.",
      "Phone down around {asleep}. Shorter night = harder day. Better tonight!",
      "{social} min on the phone after midnight. Tonight try leaving it outside the bedroom.",
    ],
    good: [
      "A clean night - zero social media after midnight. Great!",
      "Phone down at {asleep}. Nice work!",
      "A calm night without social media. Well done!",
    ],
  },
};

export function billLines(
  level: TauntLevel,
  userName: string | null,
): { bad: string[]; good: string[] } {
  const u = (l: string) => l.replaceAll("{u}", userName || L("ty", "you"));
  const b = pick(BILL, BILL_EN)[level];
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
  const usable =
    r.asleep != null && r.asleep >= 0 ? pool : pool.filter((l) => !l.includes("{asleep}"));
  let h = 0;
  for (const ch of r.date) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return fillBill(usable[h % usable.length], r);
}
