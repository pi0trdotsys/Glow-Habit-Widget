// Extra bank of Szpila's vulgar ("hard") lines, merged on top of the base
// lines in szpila.ts. Same rules: no gendered past tense or adjectives about
// the user (works for everyone), swearing aimed at the behaviour, never at
// groups of people. Placeholders: {name}, {done}, {left}, {target}; lines with
// amount placeholders are skipped automatically for single-check habits.
import type { Category } from "./szpila";

interface MoreLines {
  nag?: string[];
  praise?: string[];
  slip?: string[];
}

export const MORE_HARD: Partial<Record<Category, MoreLines>> = {
  teeth: {
    nag: [
      "Twój oddech mógłby rozpuszczać farbę ze ścian. Umyj te pierdolone zęby.",
      "Bakterie w twojej gębie założyły już związek zawodowy i żądają podwyżki. Szczoteczka, kurwa.",
      "Całujesz kogoś dziś? Nie? No to chociaż dla siebie umyj ten syf z zębów.",
      "Kamień nazębny rośnie szybciej niż twoje konto oszczędnościowe. Do łazienki, ale już.",
      "Dentysta już planuje wakacje za twoje plomby. Nie dawaj mu tej satysfakcji, szoruj.",
      "Dwie minuty. Sto dwadzieścia sekund. Nawet ty to ogarniesz, do chuja.",
      "Zęby nieumyte, a ty mi tu udajesz dorosłego człowieka. Ja pierdolę.",
      "Szczoteczka ma więcej kurzu niż twoja siłownia. Rusz się, łamago.",
    ],
    praise: [
      "Zęby umyte. Dziś przynajmniej nie zabijesz nikogo oddechem.",
      "Wyszorowane. Próchnica spierdala z podkulonym ogonem.",
      "No i chuj, da się? Da się. Zęby czyste.",
      "Umyte. Dentysta właśnie stracił ratę za nowe Audi.",
    ],
  },
  water: {
    nag: [
      "Wypite {done} z {target}. Twoje nerki właśnie piszą list pożegnalny, kurwa.",
      "Jesteś w 60% z wody, a zachowujesz się, jakby cię zrobiono z suchego chleba. Pij.",
      "Zostało {left}. To nie jest zadanie na doktorat, tylko szklanka pierdolonej wody.",
      "Kawa to nie woda, energetyk to nie woda, piwo to tym bardziej nie woda. Pij wodę, gamoniu.",
      "Ból głowy? Zmęczenie? Zgadnij, ile wody dziś wypite. {done}. Brawo, geniuszu.",
      "Skóra ci się sypie jak tynk w PRL-owskim bloku. Szklanka wody, już.",
      "Nawet paprotka na parapecie ma lepsze nawodnienie niż ty, do chuja.",
      "Kran nie gryzie. Odkręć, nalej, wypij. Trzy kroki, a ty się pierdolisz cały dzień.",
    ],
    praise: [
      "Cała woda wypita. Nerki cofają pozew.",
      "Nawodnienie zaliczone. Teraz będziesz sikać co pół godziny, ale przynajmniej jak człowiek.",
      "Komplet wody. Nawet ja jestem w szoku, kurwa.",
    ],
  },
  steps: {
    nag: [
      "{done} kroków. Tyle to robię ja, a nie mam nóg, kurwa.",
      "Brakuje {left}. Z kanapy do lodówki i z powrotem to nie jest trening, gamoniu.",
      "Twoja dupa ma już odcisk w kształcie krzesła. Wstawaj i łaź.",
      "Krokomierz myśli, że telefon leży w szufladzie. Ale nie, to po prostu twoje lenistwo, kurwa.",
      "Nogi są do chodzenia, nie do trzymania laptopa. Wyjdź na dwór, do chuja.",
      "Zostało {left}. Spacer to nie kara, tylko ratunek dla twojej zastałej dupy.",
      "Winda, auto, kanapa. Twój dzienny triathlon lenistwa. Rusz się, kurwa.",
      "Kolana zaczną ci rdzewieć jak stary Polonez. Idź się przejść.",
    ],
    praise: [
      "Kroki zrobione. Kanapa płacze w samotności.",
      "Cel kroków osiągnięty. Twoje nogi dziś pracowały ciężej niż mózg.",
      "Zaliczone. Nawet sąsiedzi widzieli cię na zewnątrz, szok, kurwa.",
    ],
  },
  reading: {
    nag: [
      "Ostatnia przeczytana rzecz to skład chipsów. Otwórz książkę, do chuja.",
      "Jeszcze {left} czytania. Mózg to mięsień, a twój wygląda jak po roku w gipsie.",
      "Książka leży i patrzy na ciebie z pogardą. Ja też.",
      "TikTok nie zrobi z ciebie mądrzejszego człowieka. Książka może. Czytaj, kurwa.",
      "Dwadzieścia minut. Nie trzy godziny. Dwadzieścia pierdolonych minut z książką.",
      "Kurz na okładce jest grubszy niż twoja cierpliwość do czegokolwiek ambitnego.",
      "Czytanie to nie przewijanie komentarzy pod memem, geniuszu. Otwieraj książkę.",
    ],
    praise: [
      "Przeczytane. Twój mózg dostał dziś coś innego niż gówno z internetu.",
      "Czytanie zaliczone. Jeszcze trochę i zaczniesz używać trudnych słów.",
      "Strony przewrócone. IQ w górę o pół punktu, kurwa, sukces.",
    ],
  },
  gym: {
    nag: [
      "Trening czeka, a ty masz formę rozgotowanego pieroga. Rusz dupę.",
      "Mięśnie zanikają, tłuszcz się rozgaszcza. Na trening, kurwa.",
      "Karnet na siłownię to najdroższa pamiątka w twoim portfelu. Idź go użyć.",
      "„{name}” czeka od rana. Wymówki są lżejsze od hantli, ale gówno ci dają.",
      "Nie musisz być bestią. Wystarczy, że przestaniesz być kanapowym warzywem.",
      "Pot albo wstyd. Dziś wybierasz wstyd? Serio, do chuja?",
    ],
    praise: [
      "Trening zrobiony. Szacun, ale nie wrzucaj selfie, błagam.",
      "Zaliczone. Twoje mięśnie przypomniały sobie, że istnieją.",
      "Przepocone. Nawet ja muszę przyznać: kawał roboty, kurwa.",
    ],
  },
  meditation: {
    nag: [
      "Masz w głowie burdel jak po sylwestrze. Pięć minut ciszy, do chuja.",
      "Oddychasz jak lokomotywa. Usiądź, zamknij ryj i oddychaj powoli.",
      "Nerwy jak postronki, a medytacja olana. Wiesz, co z tego wyjdzie? Wkurwienie.",
      "„{name}” czeka. Spokój ducha nie przyjdzie z paczki, trzeba nad nim posiedzieć.",
    ],
    praise: ["Zmedytowane. Przez chwilę w twojej głowie było cicho, cud, kurwa."],
  },
  sleep: {
    nag: [
      "Organizm błaga o sen, a ty dalej się pierdolisz z czymś. Do łóżka.",
      "Jutro będziesz żywym trupem. Idź spać, zanim będzie za późno, kurwa.",
      "Sen to nie opcja dla słabych. To warunek, żeby nie wyglądać jak gówno.",
    ],
    praise: ["Wyspane. Dziś przynajmniej wyglądasz jak człowiek, a nie zombie."],
  },
  pills: {
    nag: [
      "Tabletka leży, a ty pewnie myślisz, że samo się wchłonie przez skórę. Łykaj, kurwa.",
      "Witaminy w szufladzie nie działają. Działają w żołądku. Połknij to.",
      "„{name}” olane. Później się dziwisz, że cię wszystko łamie.",
    ],
    praise: ["Połknięte. Twój organizm dostał dziś coś lepszego niż chipsy."],
  },
  learning: {
    nag: [
      "Mózg ci zardzewieje jak stary rower w piwnicy. Ucz się, kurwa.",
      "„{name}” czeka. Nauka nie boli, boli dopiero niewiedza w najgorszym momencie.",
      "Duolingo sowa już ma na ciebie zlecenie. Lepiej siadaj do nauki.",
      "Zostało {left}. Jutro nie zapamiętasz dwa razy więcej, więc dziś, do chuja.",
    ],
    praise: ["Nauka zaliczona. Jeszcze trochę i przestaniesz udawać, że rozumiesz."],
  },
  generic: {
    nag: [
      "„{name}” czeka, a ty czekasz na cud. Cudu nie będzie, kurwa.",
      "„{name}”. Niezrobione. Znowu. Ja pierdolę, ile można.",
      "Jutro mówisz? Jutro to twoje ulubione kłamstwo. „{name}”, dziś.",
      "„{name}” się samo nie zrobi, a ja się sam nie zamknę. Wybieraj.",
      "Motywacja to ściema. Rób „{name}” bez motywacji, jak dorosły człowiek.",
      "Zostało {left} przy „{name}”. Przestań pierdolić i zacznij robić.",
      "Wstyd mi za ciebie. Serio. „{name}” leży i gnije.",
    ],
    praise: [
      "„{name}” zaliczone. Nie myśl, że teraz przestanę się czepiać.",
      "Zrobione. No kurwa, jednak coś z ciebie będzie.",
      "„{name}” odhaczone. Rzadki widok, zapiszę w kalendarzu.",
    ],
  },
  phone: {
    nag: [
      "Scrollujesz jak zahipnotyzowany chomik. Potwierdź, że dziś bez nocnego telefonu, albo liczę wpadkę.",
      "Nocne scrollowanie robi ci z mózgu galaretę. Zaznacz, że dziś odpuszczasz, kurwa.",
      "Ekran świeci ci w ryj o drugiej w nocy, a rano płacz, że zmęczenie. Potwierdź, że nie dziś.",
      "Bez potwierdzenia uznaję, że znowu leżysz z telefonem na twarzy do trzeciej. Zaznacz albo spierdalaj spać.",
    ],
    praise: [
      "Wieczór bez telefonu. Twoje oczy dziś odpoczną, a ja nie wierzę własnym czujnikom.",
      "Odłożone. Algorytmy dziś nic na tobie nie zarobiły, ha!",
    ],
    slip: [
      "Znowu nocne scrollowanie. Rano oczy jak dwie dziury w śniegu, a humor jak po pogrzebie.",
      "Druga w nocy, a ty dalej w telefonie. Ja pierdolę, jutro będzie dramat.",
      "Wpadka z telefonem. Gratulacje, kolejne pół nocy oddane internetowi za darmo, kurwa.",
    ],
  },
  fastfood: {
    nag: [
      "Potwierdź, że dziś bez fast foodów. Bo coś czuję, że burger już się smaży z twoim imieniem, kurwa.",
      "Frytki to nie warzywo, ketchup to nie sałatka. Zaznacz, że dziś czysto.",
      "Bez potwierdzenia uznaję, że żresz z papierowej torby w samochodzie. Zaznacz, jeśli nie.",
      "Twoje tętnice już się zatykają na samą myśl o zestawie powiększonym. Potwierdź, że nie dziś.",
    ],
    praise: [
      "Dzień bez fast foodów. Twoje serce właśnie przybiło ci piątkę.",
      "Czysto. Pan z okienka drive-thru dziś płacze w kasę.",
    ],
    slip: [
      "Znowu fast food. Twój żołądek to już śmietnik z rabatem.",
      "Zestaw powiększony, sumienie pomniejszone. Brawo, kurwa.",
      "Fast food zjedzony. Za godzinę głód wróci szybciej niż wstyd, zobaczysz.",
    ],
  },
  sweets: {
    nag: [
      "Potwierdź, że dziś bez słodyczy, bo widzę, jak łapa sama sięga do szuflady, kurwa.",
      "Cukier to legalny narkotyk, a ty jesteś na głodzie. Zaznacz, że dziś czysto.",
      "Czekoladka tylko jedna? Nie pierdol. Potwierdź, że dziś żadnej.",
    ],
    praise: ["Dzień bez cukru. Trzustka otwiera szampana (bezcukrowego)."],
    slip: [
      "Znowu słodycze. Twoje zęby i biodra właśnie złożyły wspólną skargę.",
      "Cukier wpierdolony. Za godzinę zjazd i marudzenie, znam to.",
    ],
  },
  alcohol: {
    nag: [
      "Potwierdź, że dziś bez procentów. „Jedno piwko” to najczęstsze kłamstwo w tym kraju, kurwa.",
      "Wątroba już się modli. Zaznacz, że dziś na trzeźwo.",
      "Bez potwierdzenia zakładam, że browar już syczy. Zaznacz, jeśli nie.",
    ],
    praise: ["Dzień na trzeźwo. Jutro obudzisz się bez kaca i bez wstydu. Nowość, co?"],
    slip: [
      "Znowu procenty. Jutro kac, a pojutrze znowu „nigdy więcej”. Znam ten numer.",
      "Chlanie zaliczone. Wątroba właśnie dopisała cię do czarnej listy.",
    ],
  },
  smoking: {
    nag: [
      "Potwierdź, że dziś bez fajek. Płuca już i tak wyglądają jak wnętrze komina, kurwa.",
      "Każdy papieros to kilka minut życia w popielniczce. Zaznacz, że dziś czysto.",
      "Jeśli dziś był dymek, śmierdzi od ciebie na kilometr. Potwierdź, że nie było.",
    ],
    praise: ["Dzień bez dymu. Płuca robią dziś fikołki z radości."],
    slip: [
      "Znowu fajka. Twoje płuca to już wędzarnia, kurwa.",
      "Dymek był. Brawo, sponsorujesz akcyzę i raka jednocześnie.",
    ],
  },
  games: {
    nag: [
      "Potwierdź, że dziś bez grania do rana. „Jeszcze jedna runda” to twoje przekleństwo, kurwa.",
      "Pad przyrósł ci do rąk. Zaznacz, że dziś odpuszczone.",
    ],
    praise: ["Dzień bez gier. Twoja postać w realu dostała dziś trochę expa."],
    slip: [
      "Znowu granie do upadłego. W grze level 80, w życiu dalej samouczek.",
      "Granie wygrało z życiem. Znowu. Kurwa mać.",
    ],
  },
  social: {
    nag: [
      "Potwierdź, że dziś bez bezmyślnego scrollowania. Twój mózg to już papka z rolek, kurwa.",
      "Algorytm karmi cię gównem, a ty prosisz o dokładkę. Zaznacz, że dziś odpuszczasz.",
    ],
    praise: ["Dzień bez rolek. Twój zasięg uwagi urósł do całych trzech minut. Rekord."],
    slip: [
      "Znowu rolki. Trzy godziny życia za filmiki o kotach i ludziach, którzy się wywracają.",
      "Scrollowanie wygrało. Twój mózg właśnie zrobił się o jeden procent gładszy.",
    ],
  },
  avoidGeneric: {
    nag: [
      "„{name}” bez potwierdzenia. Znam cię. Zakładam najgorsze, kurwa.",
      "Zaznacz, że „{name}” dziś odpuszczone, albo wpisuję wpadkę i nie będzie dyskusji.",
      "„{name}” - czysto czy znowu dajesz ciała? Potwierdź, do chuja.",
    ],
    praise: ["„{name}” dziś czyste. Nie przyzwyczajaj się do pochwał, ale szacun."],
    slip: [
      "„{name}” - znowu. Silna wola poziom: mokry karton.",
      "„{name}” wygrało z tobą. Znowu. Ja pierdolę.",
    ],
  },
};

/** Extra escalation lines (3h+ overdue / many jabs a day). */
export const MORE_RAGE: Partial<Record<Category, string[]>> = {
  teeth: [
    "Kurwa, te zęby dalej brudne. Za chwilę w twojej gębie wyrosną pieczarki.",
    "To już nie jest przypomnienie, to jest interwencja. Łazienka. Szczoteczka. TERAZ, do chuja.",
  ],
  water: [
    "Wypite {done} z {target} o tej porze? Ja pierdolę, kaktus by się zlitował.",
    "Kurwa mać, pij tę wodę, zanim wyschniesz na wiór i wiatr cię zwieje.",
  ],
  steps: [
    "{done} kroków o tej godzinie to nie wynik, to diagnoza. Wstawaj, kurwa, i łaź.",
    "Brakuje {left}, a ty dalej przyrośnięte do kanapy. Jak grzyb do drzewa, ja pierdolę.",
  ],
  reading: [
    "Cały dzień bez jednej strony. Twój mózg właśnie wyłączył się z oszczędzania energii, kurwa.",
    "Otwórz tę jebaną książkę. Choć jedną stronę. Błagam, dla dobra ludzkości.",
  ],
  gym: [
    "Trening olany od rana. Twoje mięśnie składają wypowiedzenie, a tłuszcz podpisuje umowę na czas nieokreślony.",
    "Ruszysz tę dupę dzisiaj czy mam wezwać dźwig? Na trening, kurwa!",
  ],
  meditation: [
    "Zamiast medytacji masz dziś wkurwienie i chaos. Pięć minut, do chuja, pięć minut!",
  ],
  sleep: ["Kurwa, idź już spać. Jutro będziesz zombie i znowu będzie na mnie."],
  pills: ["Tabletka dalej w opakowaniu. Myślisz, że działa przez patrzenie? Łykaj, do chuja."],
  learning: [
    "Nauka olana cały dzień. Jutro będziesz tak samo w lesie jak dziś. Siadaj, kurwa.",
  ],
  generic: [
    "„{name}” leży od rana. Ja już nie mam siły, a ty masz jej mniej niż zdechły chomik. Rób to, kurwa.",
    "Jeszcze raz: „{name}”. Nie jutro. Nie za godzinę. Teraz, do jasnej cholery.",
    "Przypominam ci o „{name}” po raz enty. Następnym razem zacznę krzyczeć capslockiem.",
  ],
  phone: [
    "Dalej zero potwierdzenia przy telefonie. Zakładam, że siedzisz z nosem w ekranie jak pierdolony zombie.",
  ],
  fastfood: ["Cały dzień bez potwierdzenia. Czuję frytki przez ekran, kurwa mać."],
  sweets: ["Brak potwierdzenia przy słodyczach. Zakładam, że cała paczka już zniknęła, ja pierdolę."],
  alcohol: ["Dalej nic przy alkoholu. Zakładam, że już leje się strumieniami, kurwa."],
  smoking: ["Brak potwierdzenia przy fajkach. Zakładam, że dymisz jak Wawel w smoczy dzień."],
  games: ["Dalej nic przy graniu. Zakładam, że pad już przyrósł ci do dłoni na amen."],
  social: ["Zero potwierdzenia przy rolkach. Zakładam, że twój kciuk przewinął już pół internetu."],
  avoidGeneric: ["„{name}” bez potwierdzenia cały dzień. Zakładam, że dajesz w palnik. Udowodnij, że nie, kurwa."],
};

export const MORE_ALL_DONE = [
  "Wszystko odhaczone. Kurwa, nie wiem, co mam teraz robić ze swoim życiem.",
  "Komplet. Idź świętować, tylko nie fast foodem, bo zaraz wracam.",
  "Zero zaległości. Czuję się jak bezrobotny, dzięki, kurwa.",
  "Cały dzień zaliczony. Jutro wracam z nową porcją jadu, nie ciesz się za bardzo.",
];

export const MORE_EVENING = [
  "Za chwilę noc, a ty masz jeszcze {pending}. Ja pierdolę, jak zwykle na ostatnią chwilę.",
  "Wieczór, a na liście dalej {pending}. Rusz się, bo jutro będzie wstyd podwójny.",
  "{pending} do zrobienia i kilka godzin do północy. Mniej gadania, więcej roboty, kurwa.",
];

export const MORE_CAUGHT = [
  "Kurwa, {m} minut z telefonem po {after}. Myślisz, że nie widzę? Widzę wszystko. Wpadka.",
  "Po {after} miało być spanie, a jest {m} minut scrollowania. Wpadka zapisana, idź spać, do chuja.",
  "Nocny patrol melduje: {m} minut ekranu po {after}. Rano nie płacz, że zmęczenie.",
];
