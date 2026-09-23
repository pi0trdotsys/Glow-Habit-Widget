// "Szpila" - the nasty sidekick. Jabs you (vulgarly, if you want) when habits
// slip, and hands out back-handed compliments when you actually do them.
// Lines are tailored per habit category (teeth, water, steps, reading, phone
// late at night, fast food, ...). Wording avoids gendered past tense on
// purpose so it fits everyone.
//
// Placeholders: {name} habit name, {u} user name. {done}/{left}/{target} are
// resolved at display time - in TS by fill(), natively by WidgetShared.fill()
// (the widget/notification side re-computes them from the live snapshot).
import type { Completion, Habit } from "./types";
import type { TauntLevel } from "./store";
import { MORE_ALL_DONE, MORE_CAUGHT, MORE_EVENING, MORE_HARD, MORE_RAGE } from "./szpila-more";
import { addDays } from "date-fns";
import {
  avoidStatus,
  dayScore,
  fmtNum,
  goalOf,
  indexEntries,
  isDueOn,
  kindOf,
  limitOf,
  minuteOfDay,
  slipsInPeriod,
  unitLabel,
  weeklyReport,
  type PlanItem,
} from "./utils";

export const SZPILA_NAME = "Szpila";

export type Category =
  | "teeth"
  | "water"
  | "steps"
  | "reading"
  | "gym"
  | "meditation"
  | "sleep"
  | "pills"
  | "learning"
  | "generic"
  | "phone"
  | "fastfood"
  | "sweets"
  | "alcohol"
  | "smoking"
  | "games"
  | "social"
  | "avoidGeneric";

interface Lines {
  nag: string[];
  praise: string[];
  /** Avoid habits only: after a slip. */
  slip?: string[];
}

const RULES: [Category, RegExp][] = [
  ["phone", /telefon|phone|p[óo][źz]n|scroll|ekran|smartfon/],
  ["fastfood", /fast|burger|mcdonald|kfc|frytk|pizza|kebab|[śs]mieciow|junk|utensils/],
  ["sweets", /s[łl]odycz|cukier|cukierk|czekolad|ciast|cookie|sweet|candy/],
  ["alcohol", /alkohol|piw|w[óo]dk|wino|drink|beer|wine/],
  ["smoking", /papieros|palen|fajk|vape|e-pap|smok|cigar/],
  ["games", /gr[ay]|gaming|gamepad|konsol/],
  ["social", /social|insta|tiktok|facebook|fb|youtube|rolk|reels/],
  ["teeth", /z[ęe]b|tooth|brush|nitk|szczotk/],
  ["water", /wod|water|droplet|glasswater|nawodn/],
  ["steps", /krok|step|footprint|spacer|walk/],
  ["reading", /czyt|ksi[ąa][żz]|read|book/],
  ["gym", /si[łl]own|gym|trening|dumbbell|bieg|run|ruch|activity|[ćc]wicz|bike|rower/],
  ["meditation", /medyt|meditat|oddech|mindful|sparkles/],
  ["sleep", /spa[ćc]|sen\b|snu|sleep|bed|[łl][óo][żz]k/],
  ["pills", /witamin|suplement|pill|lek|tablet/],
  ["learning", /nauk|j[ęe]zyk|angiel|learn|languages|kurs|graduation|notebook/],
];

function categoryOf(h: Habit): Category {
  const n = `${h.name} ${h.icon}`.toLowerCase();
  const avoid = kindOf(h) === "avoid";
  for (const [cat, re] of RULES) {
    if (!re.test(n)) continue;
    const isAvoidCat = ["phone", "fastfood", "sweets", "alcohol", "smoking", "games", "social"].includes(cat);
    if (isAvoidCat === avoid) return cat;
  }
  return avoid ? "avoidGeneric" : "generic";
}

// ---------------------------------------------------------------------------
// Lines - hard (vulgar) and soft
// ---------------------------------------------------------------------------

const HARD: Record<Category, Lines> = {
  teeth: {
    nag: [
      "Zęby dalej nieumyte? Z takim ryjem to tylko do dentysty po kredyt, kurwa.",
      "Szczoteczka płacze w łazience. Rusz dupę i umyj te zęby.",
      "Jedzie ci z paszczy aż tutaj, a ja siedzę w telefonie. Zęby. Teraz.",
      "Próchnica już rozbija namiot. Idź to, kurwa, wyszoruj.",
      "Dwie minuty szorowania, a ty nawet tego nie ogarniasz? Ja pierdolę.",
    ],
    praise: [
      "No proszę, zęby umyte. Medalu nie będzie, to podstawa higieny, ale niech ci będzie.",
      "Wreszcie. Dentysta dziś zapłacze, bo na tobie nie zarobi.",
      "Umyte. Już nie trzeba otwierać okna, jak się odzywasz.",
    ],
  },
  water: {
    nag: [
      "Wypite {done} z {target}. Nawet kaktus pije więcej, ty zasuszona śliwko.",
      "Mózg ci wysycha, dlatego tak wolno myślisz. Szklanka wody, kurwa, już.",
      "Zostało {left}. Kran jest dwa metry od ciebie, leniu.",
      "Pij tę wodę, bo skończysz jak rodzynek z promocji.",
      "Mocz w kolorze herbaty to nie jest osiągnięcie. Pij, do cholery.",
    ],
    praise: [
      "Nawodnienie zaliczone. Możesz teraz latać do kibla z dumą.",
      "Cała woda wypita. Roślinki w doniczce patrzą z zazdrością.",
    ],
  },
  steps: {
    nag: [
      "{done} kroków? Tyle robi odkurzacz automatyczny w godzinę. Rusz dupę.",
      "Brakuje {left}. Kanapa nie jest twoją życiową partnerką, kurwa.",
      "Nogi ci zaraz zanikną jak u węża. Wyjdź na spacer.",
      "Krokomierz już się wstydzi, że musi liczyć te twoje nędzne kroczki.",
      "Do celu {left}. Lodówka się nie liczy jako trasa spacerowa.",
    ],
    praise: [
      "Kroki zrobione. Twoja dupa na chwilę odkleiła się od krzesła, gratulacje.",
      "Cel kroków zaliczony. Nogi jednak działają, kto by pomyślał.",
    ],
  },
  reading: {
    nag: [
      "Książka leży i się kurzy, a ty scrollujesz rolki jak zombie.",
      "Jeszcze {left} czytania. Litery nie gryzą, w przeciwieństwie do mnie.",
      "Najdłuższy tekst, jaki dziś ogarniasz, to opis pod memem. Wstyd, kurwa.",
      "Mózg ci gnije od tego ekranu. Otwórz wreszcie tę książkę.",
    ],
    praise: [
      "Czytanie zaliczone. Może jeszcze zostaniesz człowiekiem.",
      "Przeczytane. Szare komórki dostały dziś coś lepszego niż memy.",
    ],
  },
  gym: {
    nag: [
      "Mięśnie same się nie zrobią, a z tym brzuszkiem to tylko do sumo.",
      "Hantle zardzewieją szybciej niż twoja motywacja. Na trening, kurwa.",
      "„{name}” czeka, a ty się rozlewasz po kanapie jak galareta.",
      "Pot to tłuszcz, który płacze. U ciebie nic dziś nie płacze, oprócz mnie.",
    ],
    praise: [
      "Trening zrobiony. Nie chwal się na Insta, wszyscy mają to w dupie.",
      "Zaliczone. Nawet trochę mniej przypominasz worek ziemniaków.",
    ],
  },
  meditation: {
    nag: [
      "Wdech, wydech i marsz medytować, bo nerwy masz jak postronki.",
      "Pięć minut ciszy w głowie. Dla ciebie to pewnie rekord świata, kurwa.",
      "„{name}” dalej niezrobione. Spokój ducha sam do ciebie nie przyjdzie.",
    ],
    praise: ["Zen zaliczony. Na kilka minut przestało ci odpierdalać."],
  },
  sleep: {
    nag: [
      "Zombie też tak mówią: „jeszcze chwilka”. Do łóżka, kurwa.",
      "Worki pod oczami masz już jak walizki na wakacje. Spać.",
    ],
    praise: ["Wyspane. Może dziś nie będziesz wyglądać jak po przejściach."],
  },
  pills: {
    nag: [
      "Witaminki same się nie połkną. Serio muszę ci to mówić, dorosły człowieku?",
      "„{name}” dalej w opakowaniu. Łyknij to wreszcie, do cholery.",
    ],
    praise: ["Połknięte. Brawo, umiesz popić tabletkę wodą."],
  },
  learning: {
    nag: [
      "„{name}” czeka. Głupota nie boli, ale widać ją z daleka.",
      "Zostało {left}. Twoje „jutro się nauczę” słyszę od tygodni, kurwa.",
    ],
    praise: ["Nauka zaliczona. Szansa, że nie zgłupiejesz do reszty, rośnie."],
  },
  generic: {
    nag: [
      "„{name}” dalej czeka. Myślisz, że samo się zrobi? Nie zrobi, kurwa.",
      "Leżysz i pachniesz, a „{name}” niezrobione.",
      "Tak wyglądają ludzie, którzy zaczynają „od poniedziałku”. „{name}”, teraz.",
      "„{name}”. Zostało {left}. Weź się, kurwa, w garść.",
    ],
    praise: [
      "„{name}” zaliczone. Nie przyzwyczajaj się do pochwał.",
      "Zrobione. Szok i niedowierzanie, ale zrobione.",
    ],
  },
  phone: {
    nag: [
      "Nie widzę potwierdzenia, że dziś bez nocnego scrollowania. Zaznacz, bo uznam, że siedzisz do trzeciej jak ostatni debil.",
      "Odłóż ten pierdolony telefon i zaznacz, że dziś bez siedzenia do późna.",
      "Oczy jak u kreta od ekranu. Potwierdź, że dziś idziesz spać o ludzkiej porze.",
      "Bez potwierdzenia liczę, że znowu siedzisz z telefonem pod kołdrą. Tak to działa, kurwa.",
    ],
    praise: [
      "Wieczór bez telefonu? Niemożliwe. Chyba bateria padła.",
      "Potwierdzone. Twój mózg dziś odpocznie od śmieci z internetu.",
    ],
    slip: [
      "Znowu do nocy z telefonem. Rano będziesz wyglądać jak zbity pies.",
      "Limit nocnego scrollowania przekroczony. Gratulacje, mistrzu wymówek.",
    ],
  },
  fastfood: {
    nag: [
      "Nie widzę potwierdzenia, że dziś bez fast foodów. Zaznacz, albo uznaję, że wpierdalasz burgery.",
      "Frytkownica cię woła? Potwierdź, że dziś bez tego syfu.",
      "Bez potwierdzenia liczę, że zeżarte. Tłuszcz na palcach już widzę, kurwa.",
      "Zaznacz, że dziś bez fast foodu, albo wpisuję cię na listę stałych klientów McDonalda.",
    ],
    praise: [
      "Dzień bez fast foodów. Twoje tętnice wysyłają kartkę z podziękowaniami.",
      "Czysto. Kurier z kebabem płacze pod blokiem.",
    ],
    slip: [
      "Znowu fast food. Twoja dupa rośnie szybciej niż twoja silna wola.",
      "Limit fast foodów przekroczony. Brawo, zestaw powiększony dla mistrza.",
    ],
  },
  sweets: {
    nag: [
      "Potwierdź, że dziś bez słodyczy, bo inaczej uznaję, że wpieprzasz czekoladę po kryjomu.",
      "Cukier to nie grupa żywieniowa. Zaznacz, że dziś odpuszczone.",
    ],
    praise: ["Dzień bez słodyczy. Trzustka bije ci brawo."],
    slip: ["Znowu słodycze. Cukrzyca już zaciera ręce, kurwa."],
  },
  alcohol: {
    nag: [
      "Potwierdź, że dziś na trzeźwo, bo bez tego zakładam, że browar już otwarty.",
      "Wątroba czeka na dobrą wiadomość. Zaznacz, że dziś bez procentów.",
    ],
    praise: ["Dzień na trzeźwo. Wątroba w końcu ma wolne."],
    slip: ["Znowu chlanie. Wątroba właśnie złożyła wypowiedzenie."],
  },
  smoking: {
    nag: [
      "Potwierdź, że dziś bez fajek, bo inaczej liczę, że kopcisz jak stary piec.",
      "Płuca czekają na potwierdzenie. Zaznacz, że dziś czysto.",
    ],
    praise: ["Dzień bez dymka. Płuca mogą wreszcie normalnie oddychać."],
    slip: ["Znowu dymek. Smoła w płucach otwiera szampana, kurwa."],
  },
  games: {
    nag: [
      "Potwierdź, że dziś bez grania do upadłego, bo inaczej zakładam, że pad już przyrósł ci do rąk.",
    ],
    praise: ["Dzień bez gier. Prawdziwe życie ma jednak lepszą grafikę."],
    slip: ["Znowu granie. Level w życiu: dalej 1, kurwa."],
  },
  social: {
    nag: [
      "Potwierdź, że dziś bez bezmyślnego scrollowania, bo inaczej liczę, że gnijesz na rolkach.",
    ],
    praise: ["Dzień bez rolek. Twój zasięg uwagi dłuższy niż u złotej rybki."],
    slip: ["Znowu rolki. Algorytm cię dziś wydymał, a ty się jeszcze cieszysz."],
  },
  avoidGeneric: {
    nag: [
      "„{name}” - potwierdź, że dziś nie, bo inaczej uznaję, że tak. Takie są zasady, kurwa.",
      "Brak potwierdzenia przy „{name}” = porażka. Zaznacz, jeśli masz czyste sumienie.",
    ],
    praise: ["„{name}” - dziś czysto. Nie wierzę, ale przyjmuję do wiadomości."],
    slip: ["„{name}” - znowu. Silna wola jak u pijanego gołębia."],
  },
};

const SOFT: Record<Category, Lines> = {
  teeth: {
    nag: [
      "Zęby dalej czekają na szczoteczkę. Dwie minuty, dasz radę.",
      "Szczoteczka tęskni. Umyj zęby, zanim dentysta się dowie.",
    ],
    praise: ["Zęby umyte. Uśmiech na medal."],
  },
  water: {
    nag: [
      "Wypite {done} z {target}. Jeszcze {left} - organizm będzie wdzięczny.",
      "Czas na szklankę wody. Mózg lubi być nawodniony.",
    ],
    praise: ["Cała woda wypita. Świetnie!"],
  },
  steps: {
    nag: [
      "Masz {done} kroków, brakuje {left}. Krótki spacer załatwi sprawę.",
      "Wstań, rozprostuj nogi. Do celu {left}.",
    ],
    praise: ["Cel kroków osiągnięty. Nogi dziękują!"],
  },
  reading: {
    nag: ["Książka czeka. Jeszcze {left} czytania.", "Parę stron przed snem? To dobry moment."],
    praise: ["Czytanie zaliczone. Brawo!"],
  },
  gym: {
    nag: ["„{name}” czeka. Nawet krótki trening się liczy.", "Ruch to zdrowie. Pora na „{name}”."],
    praise: ["Trening zrobiony. Szacun!"],
  },
  meditation: {
    nag: ["Kilka minut spokoju dobrze ci zrobi. Pora na „{name}”."],
    praise: ["Medytacja zaliczona. Spokój ducha +1."],
  },
  sleep: { nag: ["Pora się wyspać. Jutro podziękujesz."], praise: ["Wyspane. Tak trzymaj!"] },
  pills: { nag: ["Nie zapomnij o „{name}”."], praise: ["Zażyte. Dobra robota."] },
  learning: { nag: ["„{name}” czeka. Zostało {left}."], praise: ["Nauka zaliczona. Mądrzej z dnia na dzień!"] },
  generic: {
    nag: ["„{name}” czeka na ciebie.", "Pora na „{name}”. Zostało {left}."],
    praise: ["„{name}” zaliczone. Tak trzymaj!"],
  },
  phone: {
    nag: ["Potwierdź, że dziś bez siedzenia do późna z telefonem. Bez tego liczę jako wpadkę."],
    praise: ["Wieczór bez telefonu. Mózg odpoczywa."],
    slip: ["Znowu do późna z telefonem. Jutro spróbuj wcześniej odłożyć."],
  },
  fastfood: {
    nag: ["Potwierdź, że dziś bez fast foodów. Bez potwierdzenia liczę jako wpadkę."],
    praise: ["Dzień bez fast foodów. Brawo!"],
    slip: ["Fast food się zdarzył. Jutro nowy dzień."],
  },
  sweets: {
    nag: ["Potwierdź, że dziś bez słodyczy."],
    praise: ["Dzień bez słodyczy. Super!"],
    slip: ["Słodycze się zdarzyły. Jutro lepiej."],
  },
  alcohol: {
    nag: ["Potwierdź, że dziś bez alkoholu."],
    praise: ["Dzień bez alkoholu. Świetnie!"],
    slip: ["Alkohol się zdarzył. Jutro od nowa."],
  },
  smoking: {
    nag: ["Potwierdź, że dziś bez papierosów."],
    praise: ["Dzień bez papierosa. Płuca dziękują!"],
    slip: ["Papieros się zdarzył. Nie poddawaj się."],
  },
  games: {
    nag: ["Potwierdź, że dziś bez grania."],
    praise: ["Dzień bez gier. Brawo!"],
    slip: ["Granie się zdarzyło. Jutro lepiej."],
  },
  social: {
    nag: ["Potwierdź, że dziś bez scrollowania."],
    praise: ["Dzień bez scrollowania. Super!"],
    slip: ["Scrollowanie się zdarzyło. Jutro lepiej."],
  },
  avoidGeneric: {
    nag: ["„{name}” - potwierdź, że dziś nie. Bez tego liczę jako wpadkę."],
    praise: ["„{name}” - dziś czysto. Brawo!"],
    slip: ["„{name}” się zdarzyło. Jutro nowy dzień."],
  },
};

// Escalation tier: used when a task is 3h+ overdue or after several jabs a day.
const RAGE_HARD: Partial<Record<Category, string[]>> = {
  teeth: [
    "Kurwa mać, te zęby dalej nieumyte. Jeszcze trochę i będą ci wypadać same, z żalu.",
    "Ile razy mam ci, do chuja, przypominać o szczoteczce? Łazienka. Już.",
  ],
  water: [
    "Wypite {done} z {target}. Ja pierdolę, wielbłąd na pustyni jest bardziej nawodniony.",
    "Zostało {left}, a ty dalej udajesz, że woda to trucizna. Pij, do jasnej cholery.",
  ],
  steps: [
    "{done} kroków o tej porze? Nawet emeryt z balkonikiem cię wyprzedza. Rusz tę dupę natychmiast.",
    "Brakuje {left}. Wstawaj z tej kanapy, bo zaraz z nią zrośniesz się na amen, kurwa.",
  ],
  reading: [
    "Książka leży nietknięta cały dzień. Mózg ci się już topi jak ser na tostach.",
    "Jeszcze {left} czytania, a ty scrollujesz gówno w internecie. Wstyd na całą rodzinę.",
  ],
  gym: [
    "Trening olany od godzin. Twoje mięśnie złożyły pozew o zaniedbanie, kurwa.",
    "Hantle płaczą, kanapa się cieszy. Zgadnij, kto tu przegrywa życie.",
  ],
  phone: [
    "Dalej brak potwierdzenia. Zakładam najgorsze: siedzisz z nosem w ekranie jak ostatni zombie.",
  ],
  fastfood: [
    "Cały dzień bez potwierdzenia. Już czuję frytki z tego telefonu, kurwa.",
  ],
  generic: [
    "„{name}” leży od godzin. Serio? Ja pierdolę, jak można być tak leniwym?",
    "Dalej nic z „{name}”. Moja cierpliwość się skończyła, zostały same przekleństwa.",
  ],
  avoidGeneric: [
    "„{name}” wciąż bez potwierdzenia. Zakładam, że dajesz w palnik. Udowodnij, że nie.",
  ],
};

const RAGE_SOFT = [
  "„{name}” czeka już od dawna. To naprawdę dobry moment, żeby to zrobić.",
  "Ciągle brak „{name}”. Zrób choć trochę - każdy krok się liczy.",
];

/** Screen time caught you after the limit ({m} minutes, {after} time). */
const CAUGHT: Record<TauntLevel, string[]> = {
  hard: [
    ...MORE_CAUGHT,
    "Widzę cię! {m} min z telefonem po {after}. Wpadka zapisana, a ty rano będziesz wyglądać jak gówno.",
    "Mam cię, nocny marku. {m} min scrollowania po {after}. Odłóż to kurestwo i idź spać.",
  ],
  soft: ["{m} min z telefonem po {after} - zapisuję wpadkę. Pora odłożyć telefon i iść spać."],
};

/** Mirrors HabitNotifier.tier(): 1 = rage lines. */
export function escalationTier(overdueMin: number, jabsToday = 0): 0 | 1 {
  return overdueMin >= 180 || jabsToday >= 3 ? 1 : 0;
}

const ALL_DONE: Record<TauntLevel, string[]> = {
  hard: [
    ...MORE_ALL_DONE,
    "Wszystko zrobione. Nie mam się do czego przyjebać i strasznie mnie to wkurza.",
    "Komplet na dziś. Idź już, zanim coś spierdolisz.",
    "Cały dzień zaliczony. Nawet ja jestem pod wrażeniem, a to trudne, kurwa.",
  ],
  soft: ["Wszystko zrobione na dziś. Świetna robota!", "Komplet! Możesz odpoczywać."],
};

const EVENING: Record<TauntLevel, string[]> = {
  hard: [
    ...MORE_EVENING,
    "Dzień się kończy, a ty masz jeszcze {pending} do zrobienia. Wstyd na całą dzielnicę.",
    "Zostało {pending} i parę godzin. Rusz dupę albo jutro znowu będziesz się tłumaczyć.",
  ],
  soft: ["Zostało {pending} na dziś. Jeszcze jest czas!"],
};

const EMPTY: Record<TauntLevel, string[]> = {
  hard: ["Zero zadań? Nawet nie próbujesz. Dodaj coś, leniu."],
  soft: ["Dodaj pierwsze zadanie, a ja zajmę się resztą."],
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function pick<T>(arr: T[], seed?: number): T {
  const i = seed == null ? Math.floor(Math.random() * arr.length) : Math.abs(seed) % arr.length;
  return arr[i];
}

function linesFor(h: Habit, level: TauntLevel): Lines {
  const cat = categoryOf(h);
  if (level === "soft") return SOFT[cat];
  const base = HARD[cat];
  const more = MORE_HARD[cat] ?? {};
  return {
    nag: [...base.nag, ...(more.nag ?? [])],
    praise: [...base.praise, ...(more.praise ?? [])],
    slip: base.slip || more.slip ? [...(base.slip ?? []), ...(more.slip ?? [])] : undefined,
  };
}

/** Lines without {left}/{done} placeholders for single-check habits. */
function usable(lines: string[], h: Habit): string[] {
  if (kindOf(h) === "avoid" || goalOf(h).type !== "check") return lines;
  const ok = lines.filter((l) => !/\{(left|done|target)\}/.test(l));
  return ok.length ? ok : lines;
}

function personal(line: string, h: Habit | null, userName: string | null): string {
  return line.replaceAll("{name}", h?.name ?? "").replaceAll("{u}", userName || "ty");
}

/** Resolve {done}/{left}/{target} for a build habit's current amount. */
export function fill(line: string, h: Habit, amount: number): string {
  const g = goalOf(h);
  const left = Math.max(0, g.target - amount);
  return line
    .replaceAll("{done}", fmtNum(amount))
    .replaceAll("{target}", fmtNum(g.target))
    .replaceAll("{left}", `${fmtNum(left)} ${unitLabel(h, left)}`.trim());
}

/** Raw nag lines for a habit (placeholders {done}/{left}/{target} left in) - for the native side. */
export function nagLines(h: Habit, level: TauntLevel, userName: string | null): string[] {
  return usable(linesFor(h, level).nag, h).map((l) => personal(l, h, userName));
}

/** Escalated lines (3h+ overdue / many jabs) - placeholders left in, like nagLines. */
export function rageLines(h: Habit, level: TauntLevel, userName: string | null): string[] {
  const cat = categoryOf(h);
  const fallback = kindOf(h) === "avoid" ? "avoidGeneric" : "generic";
  const pool =
    level === "hard"
      ? [...(RAGE_HARD[cat] ?? RAGE_HARD[fallback]!), ...(MORE_RAGE[cat] ?? MORE_RAGE[fallback] ?? [])]
      : RAGE_SOFT;
  return usable(pool, h).map((l) => personal(l, h, userName));
}

/** "Caught you" lines for screen-judged habits ({m} minutes / {after} time filled natively). */
export function caughtLines(level: TauntLevel): string[] {
  return CAUGHT[level];
}

const slipsWord = (n: number) => plural5w(n, "wpadka", "wpadki", "wpadek");

function plural5w(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? few : many;
}

/**
 * "Memory" lines for repeat offenders: slips of an avoid habit in the last 30
 * days, or missed days of a build habit in the last 7. Empty when there's
 * nothing to hold against you. Counts are baked in (they change daily at most).
 */
export function memoryLines(h: Habit, completions: Completion[], level: TauntLevel, userName: string | null): string[] {
  const idx = indexEntries(completions);
  const now = new Date();
  let bad = 0;
  const days = kindOf(h) === "avoid" ? 30 : 7;
  for (let i = 1; i <= days; i++) {
    const d = addDays(now, -i);
    if (!isDueOn(h, d)) continue;
    if (kindOf(h) === "avoid" ? avoidStatus(h, idx, d, now) === "slip" : dayScore(h, idx, d, now) < 1) bad++;
  }
  const hard = level === "hard";
  let lines: string[] = [];
  if (kindOf(h) === "avoid" && bad >= 2) {
    lines = hard
      ? [
          `To już ${bad} ${slipsWord(bad)} z „{name}” w ciągu 30 dni. Mam to zapisane w zeszycie hańby.`,
          `${bad} ${slipsWord(bad)} w miesiąc. Twoja silna wola to mit, jak yeti, kurwa.`,
        ]
      : [`„{name}”: ${bad} ${slipsWord(bad)} w ostatnim miesiącu. Dziś możesz to przerwać.`];
  } else if (kindOf(h) === "build" && bad >= 3) {
    lines = hard
      ? [
          `„{name}” olane ${bad} razy w ostatnim tygodniu. Konsekwencja na poziomie złotej rybki.`,
          `Już ${bad} z 7 ostatnich dni bez „{name}”. Widzę wzorzec i jest chujowy.`,
        ]
      : [`„{name}” wypadło ${bad} razy w ostatnim tygodniu. Wróćmy do rytmu.`];
  }
  return lines.map((l) => personal(l, h, userName));
}

/** Sunday-evening weekly roast (posted natively at 20:00). */
export function weeklyRoast(habits: Habit[], completions: Completion[], level: TauntLevel, userName: string | null): string {
  if (habits.length === 0) return "";
  const r = weeklyReport(habits, completions);
  const hard = level === "hard";
  const who = userName ? `${userName}, ` : "";
  const ranked = r.perHabit
    .filter((p) => p.dueThis > 0)
    .map((p) => ({ name: p.habit.name, rate: p.this / p.dueThis }))
    .sort((a, b) => b.rate - a.rate);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  const idx = indexEntries(completions);
  const now = new Date();
  let slips = 0;
  for (const h of habits) {
    if (kindOf(h) !== "avoid") continue;
    for (let i = 0; i < 7; i++) {
      const d = addDays(now, -i);
      if (isDueOn(h, d) && avoidStatus(h, idx, d, now) === "slip") slips++;
    }
  }
  const delta = r.delta > 0 ? `+${r.delta}` : `${r.delta}`;
  const parts = [`${who}tydzień: ${r.thisWeek.rate}% (${delta} pkt vs poprzedni).`];
  if (best && worst && best.name !== worst.name) {
    parts.push(
      hard
        ? `Najlepiej „${best.name}”, najgorzej „${worst.name}” - tam odpierdalasz totalną fuszerkę.`
        : `Najlepiej szło „${best.name}”, najsłabiej „${worst.name}”.`,
    );
  }
  if (slips > 0) {
    parts.push(hard ? `Wpadek z zakazanymi: ${slips}. Brawo, mistrzu wymówek.` : `Wpadki z zakazanymi: ${slips}.`);
  }
  parts.push(
    r.delta >= 0
      ? hard
        ? "Lepiej niż tydzień temu. Nie przyzwyczajaj się, będę patrzeć na ręce."
        : "Lepiej niż tydzień temu - tak trzymaj!"
      : hard
      ? "Gorzej niż tydzień temu. Od jutra koniec pierdolenia, bierzemy się do roboty."
      : "Gorzej niż tydzień temu. Nowy tydzień, nowa szansa.",
  );
  return parts.join(" ");
}

export function allDoneLines(level: TauntLevel): string[] {
  return ALL_DONE[level];
}

export function eveningLines(level: TauntLevel): string[] {
  return EVENING[level];
}

export function praiseFor(h: Habit, level: TauntLevel, userName: string | null): string {
  return personal(pick(linesFor(h, level).praise), h, userName);
}

export function slipFor(h: Habit, level: TauntLevel, userName: string | null): string {
  const l = linesFor(h, level).slip ?? (level === "hard" ? HARD : SOFT).avoidGeneric.slip!;
  return personal(pick(l), h, userName);
}

export interface SzpilaSay {
  text: string;
  mood: "angry" | "smug" | "impressed";
  habitId?: string;
}

/** What Szpila says right now on the Today screen. `seed` rerolls the line. */
export function szpilaNow(
  habits: Habit[],
  completions: Completion[],
  plan: PlanItem[],
  level: TauntLevel,
  userName: string | null,
  seed?: number,
): SzpilaSay {
  if (habits.length === 0) return { text: pick(EMPTY[level], seed), mood: "angry" };
  const now = new Date();
  // Blown allowance on an avoid habit beats everything else.
  const blown = habits.find(
    (h) => kindOf(h) === "avoid" && slipsInPeriod(h, completions, now, now) > limitOf(h).times,
  );
  if (blown && (seed ?? 0) % 3 === 0) {
    return { text: slipFor(blown, level, userName), mood: "angry", habitId: blown.id };
  }
  if (plan.length === 0) return { text: pick(ALL_DONE[level], seed), mood: "impressed" };
  if (now.getHours() >= 20 && plan.length >= 2 && (seed ?? 1) % 2 === 0) {
    return {
      text: pick(EVENING[level], seed).replaceAll("{pending}", `${plan.length} ${plural5(plan.length)}`),
      mood: "angry",
    };
  }
  const top = plan[(seed ?? 0) % Math.min(plan.length, 2)] ?? plan[0];
  // Escalate for tasks overdue by 3h+ (same rule as the native jabs).
  const rage = escalationTier(minuteOfDay(now) - top.at) === 1;
  const pool = rage ? rageLines(top.habit, level, userName) : nagLines(top.habit, level, userName);
  const line = pick(pool, seed);
  return { text: fill(line, top.habit, top.amount), mood: top.overdue ? "angry" : "smug", habitId: top.habit.id };
}

function plural5(n: number): string {
  if (n === 1) return "zadanie";
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && !(dd >= 12 && dd <= 14) ? "zadania" : "zadań";
}

export const pendingLabel = (n: number) => `${n} ${plural5(n)}`;
