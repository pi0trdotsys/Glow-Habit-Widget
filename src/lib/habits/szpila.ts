// "Szpila" - the nasty sidekick. Jabs you (vulgarly, if you want) when habits
// slip, and hands out back-handed compliments when you actually do them.
// Lines are tailored per habit category (teeth, water, steps, reading, phone
// late at night, fast food, ...). Wording avoids gendered past tense on
// purpose so it fits everyone.
//
// Placeholders: {name} habit name, {u} user name. {done}/{left}/{target} are
// resolved at display time - in TS by fill(), natively by WidgetShared.fill()
// (the widget/notification side re-computes them from the live snapshot).
// English tables live in szpila-en.ts / szpila-en-extra.ts (same keys) and are
// picked per call by T(), so a language switch takes effect immediately.
import type { Completion, Habit } from "./types";
import type { TauntLevel } from "./store";
import {
  MORE_ALL_DONE,
  MORE_CAUGHT,
  MORE_EVENING,
  MORE_HARD,
  MORE_RAGE,
  MOTIVATE,
} from "./szpila-more";
import {
  EXTRA_AVOID,
  EXTRA_HARD,
  EXTRA_RULES,
  EXTRA_SOFT,
  type ExtraCategory,
} from "./szpila-extra";
import {
  HARD_27,
  SOFT_27,
  RAGE_SOFT_27,
  ALL_DONE_27,
  EVENING_27,
  CAUGHT_27,
  CAUGHT_SOCIAL_27,
  MOTIVATE_27,
  mergeLevels,
} from "./szpila-27";
import type { Lines27 } from "./szpila-27";
import { HARD_27X, SOFT_27X } from "./szpila-27-extra";
import { CTX_HARD, CTX_SOFT } from "./szpila-ctx";
import { create } from "zustand";
import { addDays } from "date-fns";
import { L, isEn, plural } from "@/lib/i18n";
import { humorLines, humorNag, withHumor, type HumorId } from "./gamification";
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

/** Szpila is a mean cat: normal jab, angry (escalated / slip), grudgingly impressed. Mirrored in HabitNotifier.java. */
export const SZPILA_EMOJI = { normal: "😼", angry: "😾", impressed: "😸" } as const;

export type BaseCategory =
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

export type Category = BaseCategory | ExtraCategory;

const isExtra = (c: Category): c is ExtraCategory => c in EXTRA_HARD;

export interface Lines {
  nag: string[];
  praise: string[];
  /** Avoid habits only: after a slip. */
  slip?: string[];
}

// Polish and English habit names (and icon names). English words use \p{L}
// lookarounds where a bare substring would hit unrelated words.
const RULES: [Category, RegExp][] = [
  ["phone", /telefon|phone|p[óo][źz]n|scroll|ekran|smartfon|screen ?time/u],
  [
    "fastfood",
    /fast|burger|mcdonald|kfc|frytk|(?<!\p{L})fries(?!\p{L})|pizza|kebab|takeaway|takeout|[śs]mieciow|junk|utensils/u,
  ],
  [
    "sweets",
    /s[łl]odycz|cukier|cukierk|czekolad|ciast|cookie|sweet|candy|sugar|chocolate|dessert/u,
  ],
  [
    "alcohol",
    /alkohol|alcohol|booze|piw|w[óo]dk|vodka|wino|drink|beer|wine|whisk|(?<!\p{L})drunk/u,
  ],
  ["smoking", /papieros|palen|fajk|vape|e-pap|smok|cigar|nicotin/u],
  ["games", /gr[ay]|gaming|gamepad|konsol|console|(?<!\p{L})games?(?!\p{L})|playstation|xbox/u],
  ["social", /social|insta|tiktok|facebook|fb|youtube|rolk|reels|twitter|reddit|doomscroll/u],
  ["teeth", /z[ęe]b|tooth|teeth|brush|floss|nitk|szczotk/u],
  ["water", /wod|water|droplet|glasswater|nawodn|hydrat/u],
  ["steps", /krok|step|footprint|spacer|walk/u],
  ["reading", /czyt|ksi[ąa][żz]|(?<!\p{L})read|book|(?<!\p{L})pages?(?!\p{L})/u],
  [
    "gym",
    /si[łl]own|gym|trening|training|workout|exercis|dumbbell|bieg|run|ruch|(?<!\p{L})move(?!\p{L})|activity|[ćc]wicz|bike|rower|rozci[ąa]g|stretch|yoga|joga|swim|cardio|(?<!\p{L})lift/u,
  ],
  ["meditation", /medyt|meditat|oddech|breath|mindful|sparkles/u],
  ["sleep", /spa[ćc]|sen\b|snu|sleep|bed|[łl][óo][żz]k/u],
  ["pills", /witamin|vitamin|suplement|supplement|pill|lek|tablet|medic/u],
  [
    "learning",
    /nauk|j[ęe]zyk|angiel|learn|languages|kurs|course|(?<!\p{L})stud(?:y|ies|ying)(?!\p{L})|homework|graduation|notebook/u,
  ],
];

// The rules are big Unicode regexes; a habit's category only changes with its name/icon/kind.
const categoryCache = new Map<string, Category>();

/** The Szpila category of a habit (exported for tests). */
export function categoryOf(h: Habit): Category {
  const cacheKey = `${kindOf(h)}|${h.icon}|${h.name}`;
  const hit = categoryCache.get(cacheKey);
  if (hit) return hit;
  const cat = detectCategory(h);
  if (categoryCache.size > 500) categoryCache.clear();
  categoryCache.set(cacheKey, cat);
  return cat;
}

function detectCategory(h: Habit): Category {
  const n = `${h.name} ${h.icon}`.toLowerCase();
  const avoid = kindOf(h) === "avoid";
  for (const [cat, re] of EXTRA_RULES) {
    if (re.test(n) && EXTRA_AVOID.includes(cat) === avoid) return cat;
  }
  for (const [cat, re] of RULES) {
    if (!re.test(n)) continue;
    const isAvoidCat = [
      "phone",
      "fastfood",
      "sweets",
      "alcohol",
      "smoking",
      "games",
      "social",
    ].includes(cat);
    if (isAvoidCat === avoid) return cat;
  }
  return avoid ? "avoidGeneric" : "generic";
}

// ---------------------------------------------------------------------------
// Lines - hard (vulgar) and soft
// ---------------------------------------------------------------------------

const HARD: Record<BaseCategory, Lines> = {
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

const SOFT: Record<BaseCategory, Lines> = {
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
  learning: {
    nag: ["„{name}” czeka. Zostało {left}."],
    praise: ["Nauka zaliczona. Mądrzej z dnia na dzień!"],
  },
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
  fastfood: ["Cały dzień bez potwierdzenia. Już czuję frytki z tego telefonu, kurwa."],
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

/** Caught by the social-media basis ({m} minutes of social media after {after}). */
const CAUGHT_SOCIAL: Record<TauntLevel, string[]> = {
  hard: [
    "Mam cię! {m} min social mediów po {after}. Wpadka zapisana. Budzik, muzyka - OK. TikTok i Insta - nie.",
    "{m} minut scrollowania social mediów po {after}. To nie był budzik, to był nałóg. Wpadka.",
    "Widzę wszystko: {m} min social mediów po {after} - Insta, YouTube i reszta. Odłóż to kurestwo i spać.",
  ],
  soft: ["{m} min w social mediach po {after} - zapisuję wpadkę. Pora odłożyć telefon."],
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

// Line tables per language, picked at call time (the language can change at runtime).
// The 2.7 banks (szpila-27*.ts, szpila-ctx.ts) sit next to the original ones.
const PL_T = {
  HARD,
  SOFT,
  RAGE_HARD,
  RAGE_SOFT,
  CAUGHT: mergeLevels(CAUGHT, CAUGHT_27),
  CAUGHT_SOCIAL: mergeLevels(CAUGHT_SOCIAL, CAUGHT_SOCIAL_27),
  ALL_DONE: mergeLevels(ALL_DONE, ALL_DONE_27),
  EVENING: mergeLevels(EVENING, EVENING_27),
  EMPTY,
  MORE_HARD,
  MORE_RAGE,
  MOTIVATE,
  EXTRA_HARD,
  EXTRA_SOFT,
  X27: { ...HARD_27, ...HARD_27X } as Partial<Record<Category, Lines27>>,
  S27: { ...SOFT_27, ...SOFT_27X } as Partial<Record<Category, Lines27>>,
  RAGE_SOFT27: RAGE_SOFT_27,
  M27: MOTIVATE_27,
  CTX_H: CTX_HARD,
  CTX_S: CTX_SOFT,
};
// English tables are a separate chunk, loaded only when the app is in English.
let EN_T: typeof PL_T | null = null;
let enLoading: Promise<void> | null = null;

/** Flips to true once the English lines are in (screens re-render on it). */
export const useLinesReady = create<{ en: boolean }>(() => ({ en: false }));

export function loadEnglishLines(): Promise<void> {
  enLoading ??= import("./szpila-en-tables").then((m) => {
    EN_T = m.EN_T as typeof PL_T;
    useLinesReady.setState({ en: true });
  });
  return enLoading;
}

const T = () => (isEn() && EN_T ? EN_T : PL_T);

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function pick<T>(arr: T[], seed?: number): T {
  const i = seed == null ? Math.floor(Math.random() * arr.length) : Math.abs(seed) % arr.length;
  return arr[i];
}

/** Szpila's unlocked voice (store.szpila.humor), mixed into the hard-level pools. */
let activeHumor: HumorId = "wredny";
export function setHumor(humor: HumorId): void {
  activeHumor = humor;
}
export const currentHumor = (): HumorId => activeHumor;

const joinSlips = (...pools: (string[] | undefined)[]): string[] | undefined =>
  pools.some(Boolean) ? pools.flatMap((p) => p ?? []) : undefined;

function linesFor(h: Habit, level: TauntLevel): Lines {
  const t = T();
  const cat = categoryOf(h);
  if (level === "soft") {
    const base: Lines = isExtra(cat) ? t.EXTRA_SOFT[cat] : t.SOFT[cat];
    const x = t.S27[cat] ?? {};
    return {
      nag: [...base.nag, ...(x.nag ?? [])],
      praise: [...base.praise, ...(x.praise ?? [])],
      slip: joinSlips(base.slip, x.slip),
    };
  }
  const base: Lines = isExtra(cat) ? t.EXTRA_HARD[cat] : t.HARD[cat];
  const more = isExtra(cat) ? {} : (t.MORE_HARD[cat] ?? {});
  const x = t.X27[cat] ?? {};
  const motivate =
    kindOf(h) === "avoid"
      ? [...t.MOTIVATE.avoid, ...t.M27.avoid]
      : [...t.MOTIVATE.build, ...t.M27.build];
  return {
    nag: withHumor(
      [...base.nag, ...(more.nag ?? []), ...(x.nag ?? []), ...motivate],
      humorNag(h, activeHumor),
    ),
    praise: withHumor(
      [
        ...base.praise,
        ...(more.praise ?? []),
        ...(x.praise ?? []),
        ...t.MOTIVATE.praise,
        ...t.M27.praise,
      ],
      humorLines(activeHumor).praise,
    ),
    slip: joinSlips(base.slip, more.slip, x.slip),
  };
}

/** Lines without {left}/{done} placeholders for single-check habits. */
function usable(lines: string[], h: Habit): string[] {
  if (kindOf(h) === "avoid" || goalOf(h).type !== "check") return lines;
  const ok = lines.filter((l) => !/\{(left|done|target)\}/.test(l));
  return ok.length ? ok : lines;
}

function personal(line: string, h: Habit | null, userName: string | null): string {
  return line.replaceAll("{name}", h?.name ?? "").replaceAll("{u}", userName || L("ty", "you"));
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
  const t = T();
  const cat = categoryOf(h);
  const fallback = kindOf(h) === "avoid" ? "avoidGeneric" : "generic";
  const own = t.X27[cat]?.rage ?? [];
  const pool =
    level === "hard" && isExtra(cat)
      ? [...t.EXTRA_HARD[cat].rage, ...own, ...t.MORE_RAGE[fallback]!]
      : level === "hard"
        ? [
            ...(t.RAGE_HARD[cat] ?? t.RAGE_HARD[fallback]!),
            ...(t.MORE_RAGE[cat] ?? t.MORE_RAGE[fallback] ?? []),
            ...own,
          ]
        : [...t.RAGE_SOFT, ...t.RAGE_SOFT27];
  // Build habits also get the motivating rage ("Dosyć tego. Wstajesz i robisz…").
  const all =
    level === "hard" && kindOf(h) === "build" ? [...pool, ...t.MOTIVATE.rage, ...t.M27.rage] : pool;
  return usable(all, h).map((l) => personal(l, h, userName));
}

/** "Caught you" lines for screen-judged habits ({m} minutes / {after} time filled natively). */
export function caughtLines(level: TauntLevel, basis: "social" | "screen" = "screen"): string[] {
  return basis === "social" ? T().CAUGHT_SOCIAL[level] : T().CAUGHT[level];
}

const slipsWord = (n: number) => plural(n, ["wpadka", "wpadki", "wpadek"], ["slip", "slips"]);

/**
 * "Memory" lines for repeat offenders: slips of an avoid habit in the last 30
 * days, or missed days of a build habit in the last 7. Empty when there's
 * nothing to hold against you. Counts are baked in (they change daily at most).
 */
export function memoryLines(
  h: Habit,
  completions: Completion[],
  level: TauntLevel,
  userName: string | null,
): string[] {
  const idx = indexEntries(completions);
  const now = new Date();
  let bad = 0;
  const days = kindOf(h) === "avoid" ? 30 : 7;
  for (let i = 1; i <= days; i++) {
    const d = addDays(now, -i);
    if (!isDueOn(h, d)) continue;
    if (
      kindOf(h) === "avoid" ? avoidStatus(h, idx, d, now) === "slip" : dayScore(h, idx, d, now) < 1
    )
      bad++;
  }
  const hard = level === "hard";
  let lines: string[] = [];
  if (isEn()) {
    const s = slipsWord(bad);
    if (kindOf(h) === "avoid" && bad >= 2) {
      lines = hard
        ? [
            `That's ${bad} ${s} with “{name}” in 30 days. It's all written down in my book of shame.`,
            `${bad} ${s} in a month. Your willpower is a myth, like Bigfoot, damn it.`,
          ]
        : [`“{name}”: ${bad} ${s} in the last month. You can break the chain today.`];
    } else if (kindOf(h) === "build" && bad >= 3) {
      lines = hard
        ? [
            `“{name}” skipped ${bad} times in the last week. The consistency of a goldfish.`,
            `${bad} of the last 7 days without “{name}”. I see a pattern and it's shit.`,
          ]
        : [`“{name}” was missed ${bad} times in the last week. Let's get back into the rhythm.`];
    }
    return lines.map((l) => personal(l, h, userName));
  }
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
export function weeklyRoast(
  habits: Habit[],
  completions: Completion[],
  level: TauntLevel,
  userName: string | null,
): string {
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
  const parts = [
    L(
      `${who}tydzień: ${r.thisWeek.rate}%${r.noBaseline ? "" : ` (${delta} pkt vs poprzedni)`}.`,
      `${userName ? `${userName}, your` : "Your"} week: ${r.thisWeek.rate}%${r.noBaseline ? "" : ` (${delta} pts vs last week)`}.`,
    ),
  ];
  if (best && worst && best.name !== worst.name) {
    parts.push(
      hard
        ? L(
            `Najlepiej „${best.name}”, najgorzej „${worst.name}” - tam odpierdalasz totalną fuszerkę.`,
            `Best: “${best.name}”, worst: “${worst.name}” - that's where you're doing a half-assed job.`,
          )
        : L(
            `Najlepiej szło „${best.name}”, najsłabiej „${worst.name}”.`,
            `“${best.name}” went best, “${worst.name}” the weakest.`,
          ),
    );
  }
  if (slips > 0) {
    parts.push(
      hard
        ? L(
            `Wpadek z zakazanymi: ${slips}. Brawo, mistrzu wymówek.`,
            `Slips with forbidden habits: ${slips}. Bravo, champion of excuses.`,
          )
        : L(`Wpadki z zakazanymi: ${slips}.`, `Slips with forbidden habits: ${slips}.`),
    );
  }
  if (!r.noBaseline)
    parts.push(
      r.delta >= 0
        ? hard
          ? L(
              "Lepiej niż tydzień temu. Nie przyzwyczajaj się, będę patrzeć na ręce.",
              "Better than last week. Don't get used to it, I'm watching you.",
            )
          : L("Lepiej niż tydzień temu - tak trzymaj!", "Better than last week - keep it up!")
        : hard
          ? L(
              "Gorzej niż tydzień temu. Od jutra koniec pierdolenia, bierzemy się do roboty.",
              "Worse than last week. From tomorrow, no more bullshit - we get to work.",
            )
          : L(
              "Gorzej niż tydzień temu. Nowy tydzień, nowa szansa.",
              "Worse than last week. New week, new chance.",
            ),
    );
  return parts.join(" ");
}

export function allDoneLines(level: TauntLevel): string[] {
  return T().ALL_DONE[level];
}

export function eveningLines(level: TauntLevel): string[] {
  return T().EVENING[level];
}

/** All praise lines for a habit (resolved). */
export function praiseLines(h: Habit, level: TauntLevel, userName: string | null): string[] {
  return linesFor(h, level).praise.map((l) => personal(l, h, userName));
}

/** All slip lines for an avoid habit (resolved). */
export function slipLines(h: Habit, level: TauntLevel, userName: string | null): string[] {
  const t = T();
  const l = linesFor(h, level).slip ?? (level === "hard" ? t.HARD : t.SOFT).avoidGeneric.slip!;
  return l.map((x) => personal(x, h, userName));
}

export function praiseFor(h: Habit, level: TauntLevel, userName: string | null): string {
  return pick(praiseLines(h, level, userName));
}

export function slipFor(h: Habit, level: TauntLevel, userName: string | null): string {
  return pick(slipLines(h, level, userName));
}

// ---------------------------------------------------------------------------
// Context-aware lines ("0 z 4 szklanek o 15:00", "zostało tylko…", evening, morning)
// ---------------------------------------------------------------------------

/** Situation of a pending habit right now - see contextRule(). */
export type Ctx = "zero" | "almost" | "late" | "morning";

export const CTX_KEYS: Ctx[] = ["zero", "almost", "late", "morning"];

/**
 * Thresholds of the context rule, in minutes of day / percent. Mirrored by
 * HabitNotifier.contextOf() (CTX_* constants) - keep both in sync.
 */
export const CTX_RULES = {
  morningFrom: 5 * 60,
  morningUntil: 11 * 60,
  zeroFrom: 14 * 60,
  lateFrom: 19 * 60,
  almostPct: 70,
} as const;

/** Chance (percent) that a jab uses the context pool: normal tier / rage tier. */
export const CTX_CHANCE = { normal: 50, rage: 35 } as const;

/**
 * The pure context rule (mirrors HabitNotifier.contextOf):
 *  - done build habit -> none;
 *  - avoid habit: "morning" (05:00-11:00), "late" (19:00+), else none;
 *  - build habit: "morning" when nothing is logged yet before 11:00, "almost" at
 *    70%+ of the target, "late" from 19:00, "zero" when still nothing at 14:00+.
 */
export function contextRule(
  avoid: boolean,
  amount: number,
  target: number,
  nowMinute: number,
): Ctx | null {
  const r = CTX_RULES;
  const morning = nowMinute >= r.morningFrom && nowMinute < r.morningUntil;
  if (avoid) return nowMinute >= r.lateFrom ? "late" : morning ? "morning" : null;
  if (amount >= target) return null;
  if (amount <= 0 && morning) return "morning";
  if (amount > 0 && amount * 100 >= target * r.almostPct) return "almost";
  if (nowMinute >= r.lateFrom) return "late";
  if (amount <= 0 && nowMinute >= r.zeroFrom) return "zero";
  return null;
}

/** The situation of a habit with `amount` logged today, at `nowMinute` (minutes of day). */
export function contextOf(h: Habit, amount: number, nowMinute: number): Ctx | null {
  const avoid = kindOf(h) === "avoid";
  return contextRule(avoid, avoid ? 0 : amount, avoid ? 1 : goalOf(h).target, nowMinute);
}

/**
 * Lines for a situation: the category's own pool plus the generic one (avoid
 * habits: avoidGeneric). Placeholders {done}/{left}/{target} left in, like nagLines.
 */
export function contextLines(
  h: Habit,
  level: TauntLevel,
  userName: string | null,
  ctx: Ctx,
): string[] {
  const t = T();
  const table = level === "soft" ? t.CTX_S : t.CTX_H;
  const cat = categoryOf(h);
  const fallback = kindOf(h) === "avoid" ? "avoidGeneric" : "generic";
  const lines = [
    ...(cat === fallback ? [] : (table[cat]?.[ctx] ?? [])),
    ...(table[fallback]?.[ctx] ?? []),
  ];
  // Strict for single-check habits: no amount lines at all (an empty pool falls back to nag/rage).
  const counted = kindOf(h) === "avoid" || goalOf(h).type !== "check";
  const ok = counted ? lines : lines.filter((l) => !/\{(left|done|target)\}/.test(l));
  return ok.map((l) => personal(l, h, userName));
}

/** All context pools of a habit (widget snapshot row `ctx`, read by HabitNotifier.lineFor). */
export function contextPools(
  h: Habit,
  level: TauntLevel,
  userName: string | null,
): Record<Ctx, string[]> {
  const out = {} as Record<Ctx, string[]>;
  for (const k of CTX_KEYS) out[k] = contextLines(h, level, userName, k);
  return out;
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
  const t = T();
  if (habits.length === 0) return { text: pick(t.EMPTY[level], seed), mood: "angry" };
  const now = new Date();
  // Blown allowance on an avoid habit beats everything else.
  const blown = habits.find(
    (h) => kindOf(h) === "avoid" && slipsInPeriod(h, completions, now, now) > limitOf(h).times,
  );
  if (blown && (seed ?? 0) % 3 === 0) {
    return { text: slipFor(blown, level, userName), mood: "angry", habitId: blown.id };
  }
  if (plan.length === 0) return { text: pick(t.ALL_DONE[level], seed), mood: "impressed" };
  if (now.getHours() >= 20 && plan.length >= 2 && (seed ?? 1) % 2 === 0) {
    return {
      text: pick(t.EVENING[level], seed).replaceAll("{pending}", pendingLabel(plan.length)),
      mood: "angry",
    };
  }
  const top = plan[(seed ?? 0) % Math.min(plan.length, 2)] ?? plan[0];
  // Escalate for tasks overdue by 3h+ (same rule as the native jabs).
  const rage = escalationTier(minuteOfDay(now) - top.at) === 1;
  // Situation lines ("zostało tylko…", evening, morning) win part of the time, like natively.
  const ctx = contextOf(top.habit, top.amount, minuteOfDay(now));
  const ctxPool = ctx ? contextLines(top.habit, level, userName, ctx) : [];
  const roll = seed == null ? Math.floor(Math.random() * 100) : Math.abs(seed * 37) % 100;
  const chance = rage ? CTX_CHANCE.rage : CTX_CHANCE.normal;
  const pool =
    ctxPool.length && roll < chance
      ? ctxPool
      : rage
        ? rageLines(top.habit, level, userName)
        : nagLines(top.habit, level, userName);
  const line = pick(pool, seed);
  return {
    text: fill(line, top.habit, top.amount),
    mood: top.overdue ? "angry" : "smug",
    habitId: top.habit.id,
  };
}

/** "3 zadania" / "3 tasks" - fills {pending}. */
export function pendingLabel(n: number): string {
  return `${n} ${plural(n, ["zadanie", "zadania", "zadań"], ["task", "tasks"])}`;
}
