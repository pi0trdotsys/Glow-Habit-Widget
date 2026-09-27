// Szpila lines for the categories added in Loop 2.1: coding, foreign
// languages and the things people most often try to cut down on. Same rules
// as szpila.ts: no gendered past tense/adjectives about the user, swearing at
// the behaviour, never at people. {name}/{done}/{left}/{target} placeholders.

export type ExtraCategory =
  | "pervert"
  | "coding"
  | "language"
  | "porn"
  | "meals"
  | "energy"
  | "shopping"
  | "gambling"
  | "binge"
  | "snooze"
  | "nails"
  | "caffeine"
  | "procrastination";

export const EXTRA_AVOID: ExtraCategory[] = [
  "pervert",
  "porn",
  "meals",
  "energy",
  "shopping",
  "gambling",
  "binge",
  "snooze",
  "nails",
  "caffeine",
  "procrastination",
];

/**
 * Checked before the base rules (more specific wins). Polish and English habit
 * names (plus icon names); English words use \p{L} lookarounds where a bare
 * substring would hit unrelated words.
 */
export const EXTRA_RULES: [ExtraCategory, RegExp][] = [
  [
    "pervert",
    /zbocze|zbocze[ńn]|perwers|obleś|oble[śs]|(?<!\p{L})perv|(?<!\p{L})creep(?:y|ing)?(?!\p{L})|(?<!\p{L})lewd|(?<!\p{L})ogl(?:e|es|ing)(?!\p{L})/u,
  ],
  ["porn", /porn|p0rn|onani|masturb|eyeoff/u],
  [
    "meals",
    /posi[łl]k|niejedz|g[łl]odz|pomijan|nieregularn|utensilscrossed|(?<!\p{L})meals?(?!\p{L})|skip\w* (?:breakfast|lunch|dinner)/u,
  ],
  ["energy", /energet|energy ?drink|red ?bull|monster|tauryn|taurin/u],
  [
    "shopping",
    /zakup|shopping|allegro|aliexpress|temu\b|wydawan|kupowan|creditcard|shoppingcart|shoppingbag|spending|impulse|(?<!\p{L})buy(?:s|ing)?(?!\p{L})|purchas/u,
  ],
  [
    "gambling",
    /hazard|kasyn|zak[łl]ad|bukmach|ruletk|lotto|dice|coins|gambl|casino|betting|(?<!\p{L})bets?(?!\p{L})|poker|roulette|lottery|slot machine/u,
  ],
  [
    "binge",
    /serial|netflix|telewiz|\btv\b|binge|popcorn|ogl[ąa]dan|(?<!\p{L})series(?!\p{L})|(?<!\p{L})shows(?!\p{L})|tv show|episode/u,
  ],
  ["snooze", /drzemk|budzik|snooz|alarmclockoff|(?<!\p{L})alarm(?!\p{L})/u],
  ["nails", /paznok|obgryz|nail/u],
  ["caffeine", /kaw[aąyę]|kofein|coffee|caffein|espresso/u],
  ["procrastination", /prokrast|procrast|odk[łl]adan|hourglass|lenistw|putting (?:things )?off/u],
  ["coding", /program|kodow|\bkod|code|coding|terminal|laptop|github|leetcode|\bdev\b/u],
  [
    "language",
    /j[ęe]zyk|angiel|niemieck|hiszpa|francu|w[łl]osk|duolingo|languages?(?!\p{L})|globe|s[łl][óo]wk|fiszk|vocab|flashcard|spanish|german|french|italian|english|japanese/u,
  ],
];

interface Lines {
  nag: string[];
  praise: string[];
  slip?: string[];
}

export const EXTRA_HARD: Record<ExtraCategory, Lines & { rage: string[] }> = {
  pervert: {
    nag: [
      "Potwierdź, że dziś bez zboczeństw. Oczy w górę, ręce przy sobie, myśli w porządku, kurwa.",
      "Zaznacz, że dziś obyło się bez gapienia się jak wygłodniały pies na kiełbasę.",
      "Bez potwierdzenia zakładam, że wyobraźnia znowu poszła w krzaki. Zaznacz, jeśli nie.",
      "Szacunek do ludzi to nie opcja. Potwierdź, że dziś zachowanie na poziomie, do chuja.",
      "Mózg to nie wyszukiwarka zboczeństw. Potwierdź, że dziś myśli pod kontrolą.",
    ],
    praise: [
      "Dzień bez zboczeństw. Nawet ja, kot, jestem zaskoczony.",
      "Czysto. Dziś myślenie głową, a nie czym innym.",
    ],
    slip: [
      "Znowu zboczeństwo. Zimny prysznic i ogarnij się, kurwa.",
      "Wpadka. Oczy i myśli znowu tam, gdzie nie trzeba. Jutro lepiej.",
    ],
    rage: [
      "Cały dzień bez potwierdzenia przy zboczeństwach. Zakładam, że wyobraźnia pracuje na pełnych obrotach, kurwa.",
    ],
  },
  coding: {
    nag: [
      "Kod się sam nie napisze, a AI nie zrobi za ciebie całej roboty. Odpal edytor, kurwa.",
      "„{name}” czeka. Twój git log jest pusty jak lodówka studenta.",
      "Zostało {left}. Nawet hello world byłoby lepsze niż to nic, które dziś wypuszczasz.",
      "Repo zarasta kurzem szybciej niż stara Nokia w szufladzie. Commit, do chuja.",
      "Stack Overflow nie pomoże, jak nawet nie otworzysz IDE. Rusz dupę do kodu.",
      "Programista bez kodu to po prostu człowiek z drogą klawiaturą. Pisz.",
      "Tutoriale oglądane, kod nienapisany. Klasyka, kurwa. Otwieraj edytor.",
    ],
    praise: [
      "Kod napisany. Może nawet się skompiluje, kto wie, kurwa.",
      "Programowanie zaliczone. Commit dnia: „koniec opierdalania się”.",
      "Zrobione. Bugi drżą. No, przynajmniej jeden.",
    ],
    rage: [
      "Cały dzień bez linijki kodu. Twój GitHub wygląda jak cmentarz, kurwa.",
      "Otwórz ten jebany edytor. Jedna funkcja. Jeden commit. Teraz.",
    ],
  },
  language: {
    nag: [
      "„{name}” czeka. Twoja znajomość języka to nadal „where is toaleta”, kurwa.",
      "Sowa z Duolingo już ostrzy dziób. Ucz się, zanim przyleci.",
      "Zostało {left}. Słówka same do głowy nie wejdą, nawet jak śpisz na słowniku.",
      "Za granicą znowu będziesz pokazywać na migi? Ucz się, do chuja.",
      "Serial z napisami to nie nauka języka, geniuszu. Siadaj do słówek.",
      "Dziesięć minut dziennie. Nawet papuga by to ogarnęła, a ty nie?",
    ],
    praise: [
      "Nauka języka zaliczona. Well done, czy jak to się tam mówi, kurwa.",
      "Zrobione. Jeszcze trochę i zamówisz kawę bez pokazywania palcem.",
    ],
    rage: [
      "Cały dzień bez nauki języka. Sowa z Duolingo jedzie do ciebie z kijem.",
      "Nawet pięć słówek? Nic? Ja pierdolę, no hablo lenistwo.",
    ],
  },
  porn: {
    nag: [
      "Potwierdź, że dziś bez pornosów. Bez tego zakładam, że karta incognito znowu pracuje na pełnych obrotach, kurwa.",
      "Zaznacz, że dziś czysto z pornografią. Twój mózg zasługuje na coś lepszego niż dopaminowy fast food.",
      "Bez potwierdzenia uznaję, że historia przeglądarki znowu do czyszczenia. Zaznacz, jeśli nie.",
      "Pięć minut przyjemności, a potem godzina mgły w głowie. Potwierdź, że dziś odpuszczasz pornole, kurwa.",
      "Nudzi ci się? Idź na spacer, zadzwoń do kogoś, ogarnij pokój. Byle nie pornosy. Zaznacz, że czysto.",
      "Każdy dzień bez pornografii to mózg, który sam się naprawia. Nie spierdol tego dzisiaj.",
    ],
    praise: [
      "Dzień bez pornosów. Dopamina się regeneruje, a ty odzyskujesz trochę godności.",
      "Czysto. Tryb incognito dziś na bezrobociu.",
      "Kolejny dzień bez pornosów. Głowa jaśniejsza, a ty trochę bardziej panujesz nad sobą.",
    ],
    slip: [
      "Znowu pornole. Mózg wyprany do zera, kurwa.",
      "Wpadka z pornografią. Zamknij kartę, wyjdź na powietrze i od jutra od nowa.",
      "Znowu karta incognito. Ja pierdolę, a było tak dobrze. Jutro zaczynasz liczenie od zera.",
    ],
    rage: [
      "Cały dzień bez potwierdzenia przy pornosach. Zakładam najgorsze, do chuja.",
      "Dalej cisza przy pornografii. Albo potwierdzasz, albo liczę wpadkę, kurwa. Wybieraj.",
    ],
  },
  meals: {
    nag: [
      "Potwierdź, że dziś jedzenie o normalnych porach. Kawa na śniadanie, obiad i kolację to nie dieta, kurwa.",
      "Zaznacz, że dziś bez pomijania posiłków. Organizm to nie wielbłąd.",
      "Bez potwierdzenia zakładam, że znowu żyjesz na kawie i paczce chipsów o 23:00.",
    ],
    praise: [
      "Posiłki o ludzkich porach. Żołądek w szoku, ale szczęśliwy.",
      "Dzień bez głodówki. Nawet humor jakby lepszy.",
    ],
    slip: [
      "Znowu pominięty posiłek. Potem wilczy głód i wpierdalanie wszystkiego z lodówki, znam to.",
      "Wpadka z jedzeniem. Organizm to nie kaktus, trzeba go karmić.",
    ],
    rage: [
      "Dalej brak potwierdzenia przy posiłkach. Zakładam, że żyjesz powietrzem i kofeiną, kurwa.",
    ],
  },
  energy: {
    nag: [
      "Potwierdź, że dziś bez energetyków. Serce i tak bije jak werbel na weselu, kurwa.",
      "Zaznacz, że dziś bez puszki taurynowego gówna.",
    ],
    praise: ["Dzień bez energetyków. Serce dziękuje, zęby też."],
    slip: ["Znowu energetyk. Za godzinę zjazd jak z Kasprowego."],
    rage: ["Brak potwierdzenia przy energetykach. Zakładam, że trzecia puszka już syczy."],
  },
  shopping: {
    nag: [
      "Potwierdź, że dziś bez impulsywnych zakupów. Koszyk na Allegro to nie terapia, kurwa.",
      "Zaznacz, że portfel przeżył dzień. Kolejna paczka z Chin nie zmieni ci życia.",
      "Potrzebujesz tego czy tylko ci się nudzi? Potwierdź, że dziś bez wydawania na niepotrzebne gówno.",
      "Kolejny gadżet, który za tydzień wyląduje w szufladzie? Zaznacz, że dziś karta w portfelu, kurwa.",
      "Promocja to nie oszczędność, jak tego nie potrzebujesz. Potwierdź, że dziś nic głupiego nie kupione.",
      "Twoje konto płacze, a koszyk się uśmiecha. Zaznacz, że dziś bez impulsywnych zakupów.",
    ],
    praise: [
      "Dzień bez zakupów. Konto bankowe odetchnęło z ulgą.",
      "Zero impulsywnych zakupów. Kasa została na coś, co naprawdę ma sens.",
      "Portfel zamknięty cały dzień. Nawet ja jestem pod wrażeniem, kurwa.",
    ],
    slip: [
      "Znowu zakupy. Kurier zna cię lepiej niż rodzina.",
      "Kupione. Za tydzień nawet nie będziesz pamiętać po co.",
      "Znowu niepotrzebne gówno w koszyku. Za miesiąc wyląduje na OLX za połowę ceny.",
      "Impulsywny zakup. Brawo, właśnie wymienione pieniądze na pięć minut dopaminy.",
    ],
    rage: [
      "Brak potwierdzenia przy zakupach. Zakładam, że karta już się grzeje, kurwa.",
      "Cały dzień bez potwierdzenia przy wydawaniu. Zakładam, że kurier już jedzie z kolejnym gównem.",
    ],
  },
  gambling: {
    nag: [
      "Potwierdź, że dziś bez hazardu. Kasyno zawsze wygrywa, a ty zawsze płacisz, kurwa.",
      "Zaznacz, że dziś bez zakładów. „Pewniak” to najdroższe słowo świata.",
    ],
    praise: ["Dzień bez hazardu. Twoje pieniądze zostały u ciebie. Rewolucja."],
    slip: ["Znowu hazard. Bukmacher właśnie kupił sobie nowe felgi za twoją kasę."],
    rage: ["Brak potwierdzenia przy hazardzie. Zakładam, że już stawiasz, ja pierdolę."],
  },
  binge: {
    nag: [
      "Potwierdź, że dziś bez maratonu seriali. „Jeszcze jeden odcinek” to kłamstwo, kurwa.",
      "Zaznacz, że dziś bez binge-watchingu. Netflix pyta, czy nadal oglądasz. Ja pytam, czy nadal żyjesz.",
    ],
    praise: ["Dzień bez maratonu seriali. Życie ma lepszą fabułę."],
    slip: ["Znowu cały sezon na raz. Scenarzyści się cieszą, twoje oczy mniej."],
    rage: ["Brak potwierdzenia przy serialach. Zakładam, że autoplay leci od godzin."],
  },
  snooze: {
    nag: [
      "Potwierdź, że dziś bez drzemki na budziku. Pięć razy „jeszcze 5 minut” to 25 minut życia w piździe, kurwa.",
      "Zaznacz, że wstawanie było za pierwszym razem.",
    ],
    praise: ["Wstawanie bez drzemki zaliczone. Budzik w szoku."],
    slip: ["Znowu drzemka. Budzik się poddał, a ty dalej wygrywasz z nim w lenistwie."],
    rage: ["Brak potwierdzenia przy budziku. Zakładam, że drzemka pobiła rekord."],
  },
  nails: {
    nag: [
      "Potwierdź, że dziś bez obgryzania paznokci. Palce to nie przekąska, kurwa.",
      "Zaznacz, że paznokcie przeżyły dzień.",
    ],
    praise: ["Paznokcie całe. Nawet manikiurzystka byłaby dumna."],
    slip: ["Znowu obgryzione. Wyglądają jak po walce z bobrem."],
    rage: ["Brak potwierdzenia przy paznokciach. Zakładam, że zostały same kikuty."],
  },
  caffeine: {
    nag: [
      "Potwierdź, że dziś kawa z umiarem. Potem płacz, że nie możesz zasnąć, kurwa.",
      "Zaznacz, że kofeiny było dziś tyle, ile trzeba, a nie wiadro.",
    ],
    praise: ["Kawa z umiarem. Serce bije normalnie, szok."],
    slip: ["Znowu kawa za kawą. Ręce się trzęsą jak u złodzieja w sklepie."],
    rage: ["Brak potwierdzenia przy kawie. Zakładam, że płynie ci w żyłach zamiast krwi."],
  },
  procrastination: {
    nag: [
      "Potwierdź, że dziś bez prokrastynacji. „Zrobię to później” to twoje drugie imię, kurwa.",
      "Zaznacz, że dziś robota zrobiona na czas, a nie o 23:59.",
    ],
    praise: ["Dzień bez odkładania. Nie wierzę, ale szacun."],
    slip: ["Znowu wszystko na jutro. Jutro też będzie „na jutro”, znam cię."],
    rage: ["Brak potwierdzenia przy prokrastynacji. Ironia: nawet tego nie zrobisz na czas."],
  },
};

export const EXTRA_SOFT: Record<ExtraCategory, Lines> = {
  pervert: {
    nag: ["Potwierdź, że dziś bez zboczonych zachowań i myśli."],
    praise: ["Dzień bez wpadki. Brawo!"],
    slip: ["Wpadka się zdarzyła. Jutro nowy dzień."],
  },
  coding: {
    nag: [
      "Pora na „{name}”. Nawet 15 minut kodu się liczy.",
      "Zostało {left} programowania. Dasz radę!",
    ],
    praise: ["Kod napisany. Świetna robota!"],
  },
  language: {
    nag: [
      "Kilka minut nauki języka? Pora na „{name}”.",
      "Zostało {left} nauki. Każde słówko się liczy.",
    ],
    praise: ["Nauka języka zaliczona. Brawo!"],
  },
  porn: {
    nag: [
      "Potwierdź, że dziś bez pornografii.",
      "Każdy czysty dzień się liczy. Potwierdź, że dziś bez pornografii.",
    ],
    praise: ["Dzień bez pornografii. Brawo!"],
    slip: ["Wpadka się zdarzyła. Jutro nowy dzień."],
  },
  meals: {
    nag: ["Potwierdź, że dziś jedzenie było regularne."],
    praise: ["Regularne posiłki. Super!"],
    slip: ["Posiłek pominięty. Jutro spróbuj lepiej."],
  },
  energy: {
    nag: ["Potwierdź, że dziś bez energetyków."],
    praise: ["Dzień bez energetyków. Brawo!"],
    slip: ["Energetyk się zdarzył. Jutro lepiej."],
  },
  shopping: {
    nag: [
      "Potwierdź, że dziś bez impulsywnych zakupów.",
      "Zanim coś kupisz: czy naprawdę tego potrzebujesz? Potwierdź, że dziś bez zbędnych wydatków.",
    ],
    praise: ["Dzień bez zakupów. Świetnie!"],
    slip: ["Zakup się zdarzył. Jutro lepiej."],
  },
  gambling: {
    nag: ["Potwierdź, że dziś bez hazardu."],
    praise: ["Dzień bez hazardu. Brawo!"],
    slip: ["Hazard się zdarzył. Nie poddawaj się."],
  },
  binge: {
    nag: ["Potwierdź, że dziś bez maratonu seriali."],
    praise: ["Dzień bez maratonu. Super!"],
    slip: ["Maraton się zdarzył. Jutro lepiej."],
  },
  snooze: {
    nag: ["Potwierdź, że dziś bez drzemki na budziku."],
    praise: ["Wstawanie bez drzemki. Brawo!"],
    slip: ["Drzemka się zdarzyła. Jutro spróbuj od razu."],
  },
  nails: {
    nag: ["Potwierdź, że dziś bez obgryzania paznokci."],
    praise: ["Paznokcie całe. Brawo!"],
    slip: ["Zdarzyło się. Jutro lepiej."],
  },
  caffeine: {
    nag: ["Potwierdź, że dziś kawa z umiarem."],
    praise: ["Kawa z umiarem. Super!"],
    slip: ["Kawy było za dużo. Jutro mniej."],
  },
  procrastination: {
    nag: ["Potwierdź, że dziś bez odkładania na później."],
    praise: ["Dzień bez prokrastynacji. Brawo!"],
    slip: ["Odłożone na później. Jutro od razu."],
  },
};
