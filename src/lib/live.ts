// "Szpila na żywo" - real-time night intervention. Between liveFrom and
// liveUntil (default 00:00-05:00) the native LiveGuardService watches the
// foreground app; the moment a social media app opens, Szpila pops up with a
// line for that app, then a harsher one every 5 minutes you stay in.
// The lines are generated here and mirrored in the widget snapshot (`live`).
// Placeholders: {app} app name, {time} clock, {m} minutes in the app,
// {count} how many times tonight, {u} your name.
import { Capacitor, registerPlugin } from "@capacitor/core";
import type { NotificationSettings, TauntLevel } from "@/lib/habits/store";
import { humorLive, type HumorId } from "@/lib/habits/gamification";

/** Watched apps (package -> line key + label). Mirrors LiveGuard.SOCIAL in Java. */
export const SOCIAL_APPS: { pkg: string; key: string; label: string }[] = [
  { pkg: "com.zhiliaoapp.musically", key: "tiktok", label: "TikTok" },
  { pkg: "com.ss.android.ugc.trill", key: "tiktok", label: "TikTok" },
  { pkg: "com.instagram.android", key: "instagram", label: "Instagram" },
  { pkg: "com.instagram.lite", key: "instagram", label: "Instagram Lite" },
  { pkg: "com.instagram.barcelona", key: "threads", label: "Threads" },
  { pkg: "com.facebook.katana", key: "facebook", label: "Facebook" },
  { pkg: "com.facebook.lite", key: "facebook", label: "Facebook Lite" },
  { pkg: "com.google.android.youtube", key: "youtube", label: "YouTube" },
  { pkg: "com.twitter.android", key: "x", label: "X" },
  { pkg: "com.reddit.frontpage", key: "reddit", label: "Reddit" },
  { pkg: "com.snapchat.android", key: "snapchat", label: "Snapchat" },
  { pkg: "com.pinterest", key: "pinterest", label: "Pinterest" },
  { pkg: "tv.twitch.android.app", key: "twitch", label: "Twitch" },
  { pkg: "com.linkedin.android", key: "linkedin", label: "LinkedIn" },
];

type LineKey =
  | "tiktok" | "instagram" | "threads" | "facebook" | "youtube" | "x" | "reddit"
  | "snapchat" | "pinterest" | "twitch" | "linkedin" | "generic" | "escalate" | "block";

const HARD: Record<LineKey, string[]> = {
  tiktok: [
    "{time} i odpalasz TikToka? Algorytm cię wyrucha na trzy godziny, a rano będziesz wrakiem. Odkładaj to.",
    "TikTok o {time}. Jeszcze jeden filmik, co? Tak mówi każdy ćpun. Idź spać, kurwa.",
    "Pół nocy przewijania pierdolonych tańców. {count}. raz dziś w nocy. Zamknij to gówno.",
    "Chińczycy dziękują za twój sen. Ty jutro nie podziękujesz. Wyłączaj TikToka.",
  ],
  instagram: [
    "Instagram o {time}? Oglądasz cudze idealne życie zamiast naprawiać swoje. Spać.",
    "Znowu stories o {time}. Nikt normalny nic nie wrzuca o tej porze, tylko ty tam siedzisz jak debil.",
    "Insta po północy to prosta droga do kompleksów i worów pod oczami. Odłóż to, kurwa.",
    "{count}. wejście na Instagrama tej nocy. Serio? Zamykaj i do wyra.",
  ],
  threads: [
    "Threads o {time}? Nawet boty już śpią. Twoja kolej.",
    "Czytasz kłótnie obcych ludzi w środku nocy. Wybitne. Spać.",
  ],
  facebook: [
    "Facebook o {time}? Co ty, wujek po weselu? Zamykaj to i śpij.",
    "Grupy, memy, kłótnie w komentarzach o {time}. Twoje życie zasługuje na więcej. Spać, kurwa.",
  ],
  youtube: [
    "YouTube o {time}. \"Tylko jeden filmik\" - i nagle oglądasz budowę mostów w Norwegii o czwartej. Wyłączaj.",
    "Shortsy po północy to TikTok dla udających, że to nie TikTok. Odkładaj telefon.",
    "Autoplay cię nie kocha. Chce tylko, żebyś nie spał. Zamknij YouTube'a.",
  ],
  x: [
    "X o {time}? Doomscrolling wojen i idiotów to najgorsza kołysanka świata. Spać.",
    "Czytasz wkurwiających ludzi o {time}, żeby się wkurwić przed snem? Genialne. Zamykaj.",
  ],
  reddit: [
    "Reddit o {time}. Jeszcze jeden wątek i jeszcze jeden, aż wstanie słońce. Zamykaj to.",
    "r/wszystko o {time}. Nie jesteś ekspertem od niczego z tego, co czytasz. Idź spać.",
    "{count}. raz Reddit tej nocy. Karma cię nie wyśpi. Zamknij.",
  ],
  snapchat: ["Snapchat o {time}? Nikt normalny nie wysyła teraz snapów. Spać."],
  pinterest: ["Pinterest o {time}? Wymarzony pokój urządzisz jutro. Teraz śpij w obecnym, kurwa."],
  twitch: ["Twitch o {time}? Streamer zarabia na tym, że ty nie śpisz. Wyłączaj."],
  linkedin: [
    "LinkedIn o {time}?! Nawet korpo-szczury śpią. Nikt nie da ci awansu za nocne scrollowanie.",
    "Czytasz posty o \"pokorze i wdzięczności\" o {time}? Idź spać, zanim sam zaczniesz takie pisać.",
  ],
  generic: [
    "Jest {time}, a ty na {app}? Odłóż telefon i idź spać, do cholery.",
    "{app} o {time}. Ja wszystko widzę. Zamykaj to i do łóżka.",
    "Hej, {u}. {app} w środku nocy to wpadka w toku. Zamknij, zanim się rozkręcisz.",
    "{count}. raz tej nocy na {app}. Czy ty się w ogóle słyszysz? Spać!",
  ],
  escalate: [
    "Już {m} min na {app}. Rano będziesz żałować każdej z nich. Wyłącz to kurestwo.",
    "{m} minut. Wciąż tu jesteś. Ja też. I nie odpuszczę, dopóki nie odłożysz telefonu.",
    "{m} min o {time}. To już nie jest \"chwilka\", to nałóg. Zamykaj {app}.",
    "Siedzisz na {app} od {m} min. Budzik zadzwoni, a ty będziesz wyglądać jak zombie. Spać!",
    "Kurwa, {m} minut. Poduszka płacze. Odłóż to natychmiast.",
  ],
  // Full-screen block after the 3rd jab (LiveBlock.java).
  block: [
    "Dość tego. {m} minut na {app} o {time}. Trzy szpile zignorowane - teraz ja zamykam ten cyrk.",
    "Koniec, kurwa. Trzy razy prosiłem po dobroci. {app} ma na dziś fajrant, ty też.",
    "{m} minut scrollowania o {time}. Nie, nie \"jeszcze chwila\". Idziesz spać.",
    "Zablokowane. Chcesz dalej? Przytrzymaj guzik 10 sekund i spójrz sobie w oczy.",
    "Jutro rano podziękujesz. Albo nie. Ale {app} i tak zamykasz.",
  ],
};

const SOFT: Record<LineKey, string[]> = {
  tiktok: ["TikTok o {time}? Łatwo tu utknąć na długo. Może pora odłożyć telefon?"],
  instagram: ["Instagram o {time} - wszystko to będzie tam też jutro. Czas na sen."],
  threads: ["Threads o {time}? Rozmowy poczekają do rana."],
  facebook: ["Facebook o {time}? Nic ważnego nie ucieknie. Dobranoc!"],
  youtube: ["YouTube o {time} - jeden filmik łatwo zamienia się w dziesięć. Może jutro?"],
  x: ["X o {time}? Nocne newsy tylko utrudniają zasypianie."],
  reddit: ["Reddit o {time}? Wątki poczekają. Czas na sen."],
  snapchat: ["Snapchat o {time}? Odpowiesz rano."],
  pinterest: ["Pinterest o {time}? Inspiracje poczekają do jutra."],
  twitch: ["Twitch o {time}? Nagranie obejrzysz jutro."],
  linkedin: ["LinkedIn o {time}? Kariera też potrzebuje snu."],
  generic: ["Jest {time}, a ty na {app}. Pora odłożyć telefon i iść spać."],
  escalate: ["Już {m} min na {app}. Odłóż telefon - sen jest ważniejszy."],
  block: ["Już {m} min na {app} o {time}. Czas odłożyć telefon i iść spać."],
};

/** Lines for the native guard: per-app pools + generic + escalation (placeholders resolved natively). */
export function liveLines(level: TauntLevel, userName: string | null, humor: HumorId = "wredny"): Record<string, string[]> {
  const base = level === "soft" ? SOFT : HARD;
  const extra = level === "soft" ? { first: [], escalate: [] } : humorLive(humor);
  const u = (l: string) => l.replaceAll("{u}", userName || "ty");
  const out: Record<string, string[]> = {};
  for (const [k, lines] of Object.entries(base)) {
    const add = k === "escalate" ? extra.escalate : extra.first;
    out[k] = [...lines, ...(k === "escalate" || k === "generic" ? add : [])].map(u);
  }
  return out;
}

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** The `live` part of the widget snapshot (LiveGuard.settings in Java). */
export function liveState(n: NotificationSettings, level: TauntLevel, userName: string | null, humor?: HumorId) {
  return {
    enabled: n.live,
    block: n.liveBlock,
    from: toMin(n.liveFrom),
    until: toMin(n.liveUntil),
    off: n.liveOff,
    lines: liveLines(level, userName, humor),
  };
}

/** Mirrors LiveGuard.inWindow (window may cross midnight). */
export function inLiveWindow(nowMin: number, from: number, until: number): boolean {
  if (from === until) return false;
  return from < until ? nowMin >= from && nowMin < until : nowMin >= from || nowMin < until;
}

// ---------------------------------------------------------------- native status

export interface LiveApp {
  pkg: string;
  label: string;
  installed: boolean;
}

export interface LiveStatus {
  granted: boolean;
  running: boolean;
  /** "Draw over other apps" granted (needed for the full-screen block). */
  overlay?: boolean;
  blocks?: Record<string, number>;
  passes?: Record<string, number>;
  apps: LiveApp[];
  /** Night visits per habit day ("yyyy-MM-dd" -> count). */
  hits: Record<string, number>;
}

interface LivePlugin {
  liveStatus(): Promise<LiveStatus>;
  openOverlaySettings(): Promise<void>;
}
const Native = registerPlugin<LivePlugin>("HabitWidget");

export async function openOverlaySettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) await Native.openOverlaySettings();
}

export async function liveStatus(): Promise<LiveStatus | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    return await Native.liveStatus();
  } catch {
    return null;
  }
}
