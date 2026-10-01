// Context-aware Szpila lines (Polish), picked by contextOf() in szpila.ts:
//  - zero:    nothing done yet and it's already afternoon (14:00+)
//  - almost:  a build habit at 70%+ of its target, but not done
//  - late:    evening (19:00+) and still not done / not confirmed
//  - morning: before 11:00 and nothing logged yet (first brush, first glass)
// Avoid habits only get "late" and "morning". Per-category pools are mixed with
// the generic / avoidGeneric fallbacks. Placeholders: {name}, {u}, and for build
// habits {done}/{left}/{target} (usable() drops them for single-check habits).
// Same rules as the other banks: gender-neutral, swearing at the behaviour.
// English mirror: szpila-en-ctx.ts (same keys, same number of lines).
import type { Category, Ctx } from "./szpila";

export type CtxLines = Partial<Record<Ctx, string[]>>;

export const CTX_HARD: Partial<Record<Category, CtxLines>> = {
  teeth: {
    zero: [
      "Mycie zębów: {done} z {target}, a już po południu. Ranne szorowanie poszło się jebać, kurwa.",
      "Popołudnie, a zęby dalej nieumyte od rana. Ludzie w autobusie już wiedzą dlaczego.",
      "Zero mycia zębów do tej pory. Bakterie zdążyły zjeść śniadanie, obiad i podwieczorek.",
      "Pół dnia z nieumytą paszczą. Ja pierdolę, szczoteczka, natychmiast.",
    ],
    almost: [
      "Jeszcze {left} mycia i komplet. Wieczorne szorowanie, dwie minuty, kurwa, i spokój.",
      "Rano zaliczone, został wieczór: {left}. Nie spierdol tego na ostatniej prostej.",
      "Prawie. Jeszcze {left} szczoteczki i zęby mają dzień z głowy.",
    ],
    late: [
      "Wieczór, a wieczorne mycie zębów dalej czeka. Nie kładź się z tym syfem w gębie, kurwa.",
      "Dzień się kończy. Zęby szoruje się PRZED snem, a nie w myślach o nim.",
      "Za chwilę łóżko, a zęby brudne. Bakterie już szykują nocną imprezę.",
      "Wieczorem zostało {left} mycia. Szczoteczka, pasta, dwie minuty. Dasz radę nawet ze zmęczonym mózgiem.",
      "Jak teraz nie umyjesz, przez całą noc próchnica pracuje na trzy zmiany. Do łazienki, do chuja.",
    ],
    morning: [
      "Dzień dobry, smoczy oddechu. Poranne szorowanie, zanim kogokolwiek zabijesz słowem „cześć”.",
      "Kawa poczeka. Najpierw zęby, kurwa, to dwie minuty.",
      "Rano bez mycia zębów to start dnia z ryjem jak kosz na śmieci. Szczoteczka.",
      "Pierwsze, co dziś robisz: zęby. Potem telefon. Nie odwrotnie.",
      "Poranna szczoteczka czeka. Dwie minuty i możesz otwierać usta przy ludziach.",
    ],
  },
  water: {
    zero: [
      "Wypite {done} z {target} szklanek, a już popołudnie. Ja pierdolę, nawet kwiatek dostał więcej.",
      "Po południu i ani jednej szklanki wody. Twój mózg właśnie się kurczy jak rodzynek.",
      "Zero wody do tej pory. Ból głowy, który zaraz przyjdzie, to nie przypadek, kurwa.",
      "Pół dnia na sucho. Szklanka, kran, łyk. Teraz.",
      "Jest po czternastej, a woda: {done}. Jak ty w ogóle jeszcze mrugasz?",
    ],
    almost: [
      "Zostało tylko {left}. Kurwa, jeden kubek i komplet.",
      "Wypite {done} z {target}. Ostatnia prosta, nie wymiękaj teraz.",
      "Jeszcze {left} i nawodnienie zaliczone. Nawet nie trzeba wstawać, butelka stoi obok.",
      "Prawie komplet wody. Jeszcze {left}, a nerki wyślą ci laurkę.",
    ],
    late: [
      "Wieczór, a woda: {done} z {target}. Pij teraz, tylko nie wszystko na raz, bo w nocy będziesz biegać do kibla.",
      "Dzień się kończy, a zostało {left}. Dwie szklanki do kolacji i po sprawie, kurwa.",
      "Wieczorem nadrabiasz wodę jak zaległe prace domowe. Pij, do chuja.",
      "Jeszcze {left} przed snem. Szklanka teraz, szklanka po kolacji.",
    ],
    morning: [
      "Pierwsza szklanka wody zanim kawa. Organizm po nocy jest suchy jak pieprz.",
      "Dzień dobry. Szklanka wody na start, zanim zaczniesz udawać człowieka.",
      "Rano woda, potem reszta świata. Jeden łyk, kurwa, nie umrzesz.",
      "Poranne nawodnienie to najłatwiejszy plusik dnia. Weź go.",
      "Zanim odpalisz telefon, wypij szklankę wody. Taki deal.",
    ],
  },
  steps: {
    zero: [
      "Kroki: {done} z {target}, a już popołudnie. Opaska myśli, że leży w szufladzie.",
      "Po południu i dalej zero kroków. Ja pierdolę, nawet do lodówki się nie chodzi?",
      "Pół dnia na dupie. Wstań i zrób chociaż rundkę wokół bloku, kurwa.",
      "Krokomierz pokazuje {done}. To nie wynik, to cisza przed burzą wstydu.",
    ],
    almost: [
      "Brakuje tylko {left}. Krótki spacer z psem sąsiada i gotowe.",
      "{done} z {target}. Kwadrans marszu i komplet, kurwa, nie odpuszczaj teraz.",
      "Jeszcze {left}. Idź po coś do sklepu, i to nie tego najbliższego.",
      "Prawie! Brakuje {left}. Pokręć się po mieszkaniu, przejdź się schodami, cokolwiek.",
    ],
    late: [
      "Wieczór, a brakuje {left}. Spacer po kolacji, zanim kanapa cię wessie.",
      "Dzień się kończy, kroków brak. Buty, kurtka, dwadzieścia minut, do chuja.",
      "Wieczorny spacer to najlepszy sposób na sen. I na {left}, których ci brakuje.",
      "Jeszcze {left} do celu, a za oknem ciemno. Latarnie też świecą, kurwa, idź.",
    ],
    morning: [
      "Ranek. Idź pieszo do pracy, autobusu albo choćby do piekarni. Kroki same się nabiją.",
      "Dzień dobry, opaska już czeka na pierwsze kroki. Nie każ jej się nudzić.",
      "Rano kilka tysięcy kroków to połowa sukcesu na cały dzień. Rusz się.",
      "Poranny spacer budzi lepiej niż kawa. Spróbuj, kurwa, raz w życiu.",
    ],
  },
  reading: {
    zero: [
      "Czytanie: {done} z {target} min, a już popołudnie. Książka zaczyna pokrywać się pajęczyną.",
      "Pół dnia bez jednej strony. Za to ile rolek, co?",
      "Zero czytania do tej pory. Przerwa na kawę to idealne pięć stron, kurwa.",
    ],
    almost: [
      "Jeszcze tylko {left} czytania. Jeden rozdział i masz z głowy.",
      "Przeczytane {done} z {target} min. Dokończ, bo bohaterowie stoją w połowie akcji.",
      "Zostało {left}. Tyle zajmuje jedna kłótnia w komentarzach. Wybierz książkę.",
    ],
    late: [
      "Wieczór to najlepsza pora na książkę. Telefon odłożyć, lampka, czytasz. Kurwa, proste.",
      "Przed snem zostało {left} czytania. Zaśniesz szybciej niż przy TikToku.",
      "Dzień się kończy, książka nietknięta. Dziesięć stron w łóżku zamiast scrollowania.",
      "Łóżko, książka, zero ekranu. Taki wieczór zamawiam, do chuja.",
    ],
    morning: [
      "Kilka stron rano przy kawie to lepszy start niż wiadomości z internetu.",
      "Ranek. Książka obok kubka, pięć minut czytania i dzień od razu mądrzejszy.",
      "Zanim otworzysz maila, otwórz książkę. Na chwilę.",
    ],
  },
  coding: {
    zero: [
      "Programowanie: {done} z {target} min, a już popołudnie. Edytor dalej śpi, a ty z nim.",
      "Pół dnia, zero kodu. Commit dnia: „nic”. Kurwa.",
      "Po południu i ani jednej linijki. Nawet „hello world” się obraża.",
      "Do tej pory zero kodu. Odpal laptopa, zanim wymyślisz kolejną wymówkę.",
    ],
    almost: [
      "Jeszcze tylko {left} kodu. Dokończ tę funkcję i zrób commit.",
      "Napisane {done} z {target} min. Jeden test, jeden fix i komplet, kurwa.",
      "Zostało {left}. Nie zostawiaj gałęzi w połowie, bo jutro nic nie zrozumiesz.",
      "Prawie. Jeszcze {left} programowania i push. No dawaj.",
    ],
    late: [
      "Wieczór, a kod dalej nienapisany. Trzydzieści minut przed snem, edytor, muzyka. Jazda, kurwa.",
      "Dzień się kończy. Zostało {left} kodu. Nawet mały fix się liczy.",
      "Wieczorne kodowanie to klasyka. Tylko zrób to przed północą, a nie do trzeciej.",
      "Jeszcze {left} programowania. Wyłącz serial, włącz IDE, do chuja.",
    ],
    morning: [
      "Rano mózg jest świeży. Idealna pora na trudny kawałek kodu.",
      "Dzień dobry. Kawa, edytor, pół godziny kodu, zanim świat zacznie dzwonić.",
      "Poranny commit smakuje lepiej niż poranna kawa. No, prawie.",
      "Zacznij dzień od kodu, a nie od maili. Maile poczekają, kurwa.",
    ],
  },
  language: {
    zero: [
      "Nauka języka: {done} z {target} min, a już popołudnie. Sowa z Duolingo ostrzy pazury.",
      "Pół dnia bez jednego słówka. Seria trzęsie się ze strachu, kurwa.",
      "Zero nauki do tej pory. Lekcja w apce to pięć minut w kolejce do kasy.",
      "Po południu, a w głowie dalej tylko polski. Fiszki, do chuja.",
    ],
    almost: [
      "Jeszcze tylko {left} nauki. Jedna lekcja i seria żyje.",
      "Zrobione {done} z {target} min. Powtórka słówek i komplet.",
      "Zostało {left}. Nawet sowa by cię teraz poklepała. No, prawie.",
    ],
    late: [
      "Wieczór, a nauka języka olana. Seria umrze o północy, a z nią twoja duma. Ucz się, kurwa.",
      "Dzień się kończy. Zostało {left} nauki. Fiszki do łóżka zamiast telefonu.",
      "Ostatnia szansa na dzisiejszą lekcję. Sowa z Duolingo patrzy na zegarek.",
      "Jeszcze {left} przed snem. Słówka przed snem zapamiętuje się najlepiej, serio.",
    ],
    morning: [
      "Rano mózg chłonie jak gąbka. Pięć słówek do kawy.",
      "Good morning, czy jak to się tam mówi. Lekcja na rozgrzewkę, kurwa.",
      "Zacznij dzień od lekcji w apce, a nie od scrollowania. Seria podziękuje.",
      "Ranek to dobry moment na powtórkę wczorajszych słówek, zanim uciekną.",
    ],
  },
  gym: {
    zero: [
      "Popołudnie i zero ruchu. Ciało pyta, czy jeszcze o nim pamiętasz.",
      "Pół dnia bez treningu. Dziesięć minut po pracy, kurwa, bez wymówek.",
    ],
    almost: [
      "Jeszcze {left} treningu. Ostatnia seria i koniec.",
      "Prawie. Zostało {left}, dociśnij, kurwa.",
    ],
    late: [
      "Wieczór, a trening dalej czeka. Krótki, ale zrobiony, do chuja.",
      "Dzień się kończy. Rozciąganie przed snem też się liczy.",
    ],
    morning: [
      "Poranny trening i masz cały dzień z głowy.",
      "Rano kilka ćwiczeń budzi lepiej niż kawa.",
    ],
  },
  meditation: {
    zero: ["Popołudnie, a zero minuty ciszy. Głowa ci zaraz eksploduje, kurwa. Usiądź na chwilę."],
    almost: ["Jeszcze tylko {left} spokoju. Wytrzymaj, prawie koniec."],
    late: [
      "Wieczór to idealna pora na kilka oddechów przed snem. Zrób to, kurwa.",
      "Dzień się kończy. Pięć minut ciszy i zaśniesz jak dziecko.",
    ],
    morning: ["Rano pięć minut oddechu i dzień zaczyna się bez wkurwienia."],
  },
  sleep: {
    late: [
      "Wieczór. Zacznij się wyciszać, bo znowu skończysz o drugiej, kurwa.",
      "Dzień się kończy. Ekran ciemniej, światło ciemniej, do łóżka.",
    ],
    morning: ["Wyspane? Jeśli nie, dziś kładziesz się wcześniej. Zapisuję."],
  },
  pills: {
    zero: ["Popołudnie, a „{name}” dalej w opakowaniu. Łyk, kurwa, dwie sekundy."],
    late: ["Wieczór, a „{name}” niewzięte. Teraz, zanim zapomnisz do jutra."],
    morning: ["Rano, do śniadania: „{name}”. Najłatwiejsza rzecz dnia."],
  },
  learning: {
    zero: ["Popołudnie i zero nauki. Kwadrans, kurwa, tylko kwadrans."],
    almost: ["Jeszcze tylko {left} nauki. Dokończ, póki pamiętasz, o co chodziło."],
    late: ["Wieczór, a nauka dalej czeka. Kwadrans przed snem i odhaczone, do chuja."],
    morning: ["Rano głowa świeża. Najlepszy moment na naukę."],
  },
  generic: {
    zero: [
      "Popołudnie, a „{name}” dalej na zerze. Kurwa, co ty robisz z tym dniem?",
      "Pół dnia minęło, „{name}”: {done} z {target}. Ja pierdolę.",
      "Jest już po południu. „{name}” nawet nie zaczęte. Zacznij od małego kroku.",
      "Zero przy „{name}”, a zegar leci. Rusz się, do chuja.",
      "Połowa dnia za tobą, a „{name}” nietknięte. Druga połowa to twoja ostatnia szansa.",
    ],
    almost: [
      "„{name}”: zostało tylko {left}. Kurwa, dokończ to.",
      "Już {done} z {target} przy „{name}”. Ostatnia prosta, nie wymiękaj.",
      "Jeszcze {left} i „{name}” odhaczone. Szkoda to teraz spierdolić.",
      "Prawie! „{name}” czeka już tylko na {left}.",
      "Tak blisko przy „{name}”. Jeszcze {left} i możesz się chwalić.",
    ],
    late: [
      "Dzień się kończy, a „{name}” dalej niezrobione. Ostatni dzwonek, kurwa.",
      "Wieczór. „{name}” albo wyrzuty sumienia do poduszki. Wybieraj.",
      "Zostało kilka godzin, a „{name}” czeka. Teraz albo jutro ze wstydem.",
      "Wieczorem wymówki są najgłośniejsze. Zagłusz je i zrób „{name}”, do chuja.",
      "Do północy niewiele, a „{name}” nieodhaczone. Ja pierdolę, zawsze na ostatnią chwilę.",
      "Jeszcze {left} przy „{name}”, a dzień się kończy. Dawaj, ostatnia runda.",
    ],
    morning: [
      "Dzień dobry. „{name}” na start i resztę dnia masz luz.",
      "Rano najłatwiej. Zrób „{name}”, zanim dzień cię pochłonie.",
      "Poranek, kawa i „{name}”. W tej kolejności albo odwrotnie, byle zrobione, kurwa.",
      "Nowy dzień, czysta karta. Zacznij od „{name}”.",
      "Zanim zaczniesz scrollować, zrób „{name}”. Taki poranny deal.",
    ],
  },
  phone: {
    late: [
      "Wieczór. Ładowarka do kuchni, telefon za nią. Łóżko bez ekranu, kurwa.",
      "Zaraz pora spać. Jak dziś telefon zostanie poza łóżkiem, rano zaznaczysz czysto z dumą.",
      "Noc się zbliża, a z nią pokusa scrollowania pod kołdrą. Odłóż telefon już teraz.",
      "Wieczorem najłatwiej przegrać z telefonem. Ustaw budzik i odłóż go ekranem w dół, do chuja.",
    ],
    morning: [
      "Dzień dobry. Jak minęła noc z telefonem? Zaznacz, zanim zapomnisz, kurwa.",
      "Rano widać, czy w nocy było scrollowanie. Oczy nie kłamią. Potwierdź noc.",
      "Nowy dzień. Dziś wieczorem telefon śpi osobno. Zapisz to sobie.",
    ],
  },
  fastfood: {
    late: [
      "Wieczór to godzina zero dla fast foodów. Aplikacja z jedzeniem kusi. Nie klikaj, kurwa.",
      "Dzień prawie czysty. Nie spierdol go kebabem o 22:00.",
      "Wieczorny głód? Kanapka, jajecznica, cokolwiek z lodówki. Byle nie z okienka.",
      "Zaraz koniec dnia bez burgera. Zaznacz, że czysto, zanim zgłodniejesz.",
    ],
    morning: [
      "Nowy dzień. Dziś bez fast foodów, a obiad z talerza, nie z kartonu.",
      "Rano łatwo obiecać „dziś bez burgera”. Trzymaj się tego do wieczora, kurwa.",
      "Zaplanuj dziś obiad, to nie wyląduje w drive-thru. Proste.",
    ],
  },
  porn: {
    late: [
      "Wieczór i noc to najtrudniejsze godziny. Telefon poza sypialnią, kurwa, i będzie łatwiej.",
      "Dzień prawie czysty. Nie spierdol go o północy w trybie incognito.",
      "Wieczorem nuda i zmęczenie. Prysznic, książka, sen. Byle nie przeglądarka.",
      "Zaraz koniec dnia. Zaznacz, że czysto, i idź spać jak człowiek.",
    ],
    morning: [
      "Nowy dzień, nowa szansa na czystą serię. Nie zmarnuj jej.",
      "Rano głowa jest najczystsza. Zapamiętaj to uczucie na wieczór.",
      "Dzień dobry. Dziś wygrywasz z nawykiem. Zaplanuj wieczór, zanim on zaplanuje ciebie.",
    ],
  },
  shopping: {
    late: [
      "Wieczór to czas zakupów z nudów. Zamknij aplikacje sklepów, kurwa.",
      "Dzień bez zakupów prawie zaliczony. Nie spierdol go koszykiem o 23:00.",
      "Wieczorem promocje krzyczą najgłośniej. Ty nie słuchaj. Zaznacz, że portfel przeżył.",
    ],
    morning: [
      "Nowy dzień. Karta zostaje w portfelu, a koszyk pusty.",
      "Rano łatwo powiedzieć „dziś nic nie kupuję”. Wieczorem przypomnę ci te słowa.",
      "Dzień dobry. Zanim coś kupisz, odczekaj dobę. Zasada dnia.",
    ],
  },
  pervert: {
    late: [
      "Wieczór. Zamknij dzień kulturalnie i zaznacz, że było czysto, kurwa.",
      "Dzień się kończy. Bez nocnych wiadomości do ludzi, którzy nie odpisują.",
      "Zaraz noc, a noc to nie zaproszenie do odpierdalania. Zaznacz, że czysto.",
    ],
    morning: [
      "Nowy dzień. Oczy na wysokości oczu, ręce przy sobie. Tyle.",
      "Rano przypomnienie: szacunek do ludzi cały dzień. Wieczorem to sprawdzę.",
      "Dzień dobry. Dziś myślenie głową, nie hormonami.",
    ],
  },
  meals: {
    late: [
      "Wieczór. Jeśli dzisiaj jakiś posiłek przepadł, zjedz teraz normalną kolację, kurwa.",
      "Dzień się kończy. Kolacja to nie opcja, to obowiązek. Zjedz coś ciepłego.",
      "Wieczorem wilczy głód dopada tych, co pominęli obiad. Zjedz porządnie, zanim lodówka przegra.",
      "Zaraz koniec dnia. Zjedz kolację i zaznacz, że dziś bez pomijania posiłków.",
    ],
    morning: [
      "Dzień dobry. Śniadanie, a nie tylko kawa. Kurwa, choćby kanapka.",
      "Rano organizm jest na rezerwie. Zatankuj: śniadanie.",
      "Zanim wyjdziesz z domu, zjedz coś. Głodny poranek to wkurwione popołudnie.",
      "Pierwszy posiłek dnia czeka. Jajko, owsianka, jogurt. Do wyboru, do koloru.",
    ],
  },
  avoidGeneric: {
    late: [
      "Wieczór. „{name}” - dzień prawie czysty. Nie spierdol go na ostatniej prostej.",
      "Dzień się kończy. Zaznacz „{name}”, zanim zapomnisz, kurwa.",
      "Zaraz noc. Jak przy „{name}” było czysto, kliknij. Jak nie, przyznaj się.",
      "Ostatnie godziny dnia to najtrudniejsza część przy „{name}”. Trzymaj się.",
      "Wieczorem pokusa rośnie. „{name}” dziś nie wygra, do chuja.",
    ],
    morning: [
      "Nowy dzień, czysta karta przy „{name}”. Nie zmarnuj jej przed obiadem.",
      "Rano łatwo obiecać. Dziś przy „{name}” obietnica ma przetrwać do wieczora.",
      "Dzień dobry. „{name}” dziś nie, a wieczorem zaznaczysz, że się udało.",
      "Poranek. Zaplanuj dzień tak, żeby „{name}” nie miało szans.",
      "Rano przypominam: „{name}” to dziś nie twoja bajka, kurwa.",
    ],
  },
};

export const CTX_SOFT: Partial<Record<Category, CtxLines>> = {
  teeth: {
    late: ["Wieczorne mycie zębów i możesz spokojnie spać."],
    morning: ["Dzień dobry! Poranne mycie zębów na dobry start."],
  },
  water: {
    zero: ["Popołudnie - dobry moment na pierwszą szklankę wody."],
    almost: ["Zostało tylko {left}. Prawie komplet!"],
    morning: ["Szklanka wody na start dnia to świetny nawyk."],
  },
  steps: {
    almost: ["Brakuje tylko {left}. Krótki spacer i gotowe!"],
    late: ["Wieczorny spacer pomoże dobić do celu."],
  },
  reading: { late: ["Wieczór to świetna pora na kilka stron."] },
  coding: { almost: ["Jeszcze tylko {left} kodu. Prawie!"] },
  language: { late: ["Krótka lekcja przed snem utrzyma serię."] },
  meals: { morning: ["Dzień dobry! Pora na śniadanie."], late: ["Pora na spokojną kolację."] },
  generic: {
    zero: [
      "Popołudnie - dobry moment, żeby zacząć „{name}”.",
      "„{name}” jeszcze czeka. Nawet mały krok się liczy.",
    ],
    almost: ["„{name}”: zostało tylko {left}. Prawie!", "Już blisko celu przy „{name}”."],
    late: [
      "Dzień się kończy - jeszcze jest czas na „{name}”.",
      "Wieczór to dobry moment na „{name}”.",
    ],
    morning: ["Dzień dobry! Może zaczniesz od „{name}”?", "Poranek to świetna pora na „{name}”."],
  },
  avoidGeneric: {
    late: ["Wieczór - pamiętaj, żeby potwierdzić „{name}”.", "Prawie koniec dnia. Trzymasz się!"],
    morning: ["Nowy dzień, nowa szansa przy „{name}”.", "Dzień dobry! Dziś też dasz radę."],
  },
};
