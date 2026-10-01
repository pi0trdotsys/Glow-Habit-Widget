// Szpila's lines for the rescue day ("nigdy dwa razy z rzędu"), reaching the
// minimum version, and the weekly focus. Same rules as szpila.ts: no gendered
// past tense about the user, swearing at the behaviour only. Placeholders:
// {name} habit name, {min} the minimum ("5 min", "1 szklanka") - both resolved
// in TS before the lines reach the native side.
import type { TauntLevel } from "./store";
import { pick } from "@/lib/i18n";

export interface RescueLines {
  /** Rescue day, build habit: push the minimum. */
  rescue: string[];
  /** Rescue day, avoid habit (yesterday was a slip). */
  rescueAvoid: string[];
  /** The minimum reached on a rescue day (or any day below the goal). */
  rescuePraise: string[];
  /** Nag about this week's focus habit. */
  focus: string[];
  /** The focus habit done today. */
  focusPraise: string[];
}

const PL: Record<TauntLevel, RescueLines> = {
  hard: {
    rescue: [
      "Wczoraj „{name}” poszło się jebać. Dziś nie ma drugiego razu. Wystarczy {min}.",
      "Jeden dzień przerwy to wypadek. Dwa to nowy nawyk, i to chujowy. „{name}”: {min} i łańcuch żyje.",
      "Nie musisz dziś robić całości. {min} „{name}” i wracamy do gry. Tyle chyba dasz radę, kurwa?",
      "Wczorajsze zero boli. Dzisiejsze zero zabije serię. {min}. Teraz.",
      "Nigdy dwa razy z rzędu. To jedyna zasada, której nie wolno złamać. „{name}”, {min}, już.",
      "Ratunek dla „{name}”: {min}. Nie godzina, nie ideał. {min} i koniec pierdolenia.",
      "Wczoraj odpuszczone, rozumiem. Dziś odpuszczenie to już charakter. {min} „{name}”.",
      "Minimum na dziś: {min}. Mniej się nie da, a więcej nikt nie każe. Rusz się.",
      "Łańcuch wisi na włosku. {min} „{name}” i przetrwa. Zero i wszystko od nowa, do cholery.",
      "Druga dziura z rzędu w „{name}”? Po moim trupie. {min}, teraz.",
      "Wczoraj „{name}” leżało. Dziś nie ma, że boli. Rób, kurwa.",
      "Dwa dni z rzędu bez „{name}” to już nie przerwa, tylko rezygnacja. Nie dziś.",
      "Nigdy dwa razy z rzędu. „{name}” dzisiaj, choćby byle jak.",
    ],
    rescueAvoid: [
      "Wczoraj wpadka z „{name}”. Dziś nie dwa razy z rzędu. Potwierdź wieczorem, że czysto.",
      "Jedna wpadka to wypadek. Dwie to już styl życia. „{name}” - dziś czysto, kurwa.",
      "Po wczorajszym „{name}” dziś jest dzień próby. Nie spierdol tego.",
      "Nigdy dwa razy z rzędu. Wczoraj było, dziś „{name}” zostaje za drzwiami.",
      "Wczoraj przegrana z „{name}”. Dziś rewanż, i masz go wygrać.",
    ],
    rescuePraise: [
      "Uratowane. {min} „{name}” i łańcuch trzyma. Tak się wraca.",
      "Minimum zrobione. Nie medal, ale seria żyje. Szanuję, trochę.",
      "{min} i po sprawie. Wczorajszy dołek się nie powtórzył. Dobra robota, kurwa.",
      "Wracasz do gry. „{name}” ma się dobrze. Jutro może nawet całość?",
      "Nigdy dwa razy - zaliczone. Tak wygląda konsekwencja, nie perfekcja.",
    ],
    focus: [
      "„{name}” to twój cel tygodnia. Leży. Serio, ten jeden?",
      "Cel tygodnia: „{name}”. Wybrany przez ciebie, olany przez ciebie. Ruszaj.",
      "Z całej listy masz pilnować jednego: „{name}”. Jednego, kurwa.",
      "Tydzień ma jeden priorytet i jest nim „{name}”. Reszta może poczekać, to nie.",
      "Obiecany cel tygodnia „{name}” patrzy z wyrzutem. Ja też.",
      "„{name}” miało być w tym tygodniu najważniejsze. Na razie jest najbardziej olane.",
      "Cel tygodnia to nie dekoracja. „{name}”. Teraz.",
      "Jeden cel, siedem dni. „{name}” nie zrobi się samo, do chuja.",
    ],
    focusPraise: [
      "Cel tygodnia „{name}” zaliczony na dziś. O to chodziło.",
      "„{name}” odhaczone. Cel tygodnia w dobrych rękach. Na razie.",
      "Priorytet zrobiony. Reszta dnia to już bonus.",
      "„{name}” zrobione. Tak się buduje tydzień, a nie listę wymówek.",
    ],
  },
  soft: {
    rescue: [
      "Wczoraj „{name}” się nie udało. Dziś wystarczy {min}, żeby wrócić do rytmu.",
      "Nigdy dwa razy z rzędu: {min} „{name}” i seria trwa.",
      "Gorszy dzień? Zrób chociaż {min}. To naprawdę się liczy.",
      "Wczoraj się nie udało. Dziś „{name}”, choćby krótko.",
    ],
    rescueAvoid: [
      "Wczoraj była wpadka z „{name}”. Dziś spróbuj zostać przy czystym dniu.",
      "Po wczorajszym dniu: „{name}” dziś nie. Dasz radę.",
    ],
    rescuePraise: [
      "Minimum zrobione - łańcuch trwa. Brawo!",
      "{min} „{name}” i wracasz do rytmu. Świetnie!",
    ],
    focus: [
      "„{name}” to twój cel tygodnia. To dobry moment.",
      "Cel tygodnia czeka: „{name}”.",
      "Pamiętaj o celu tygodnia: „{name}”.",
    ],
    focusPraise: [
      "Cel tygodnia „{name}” zrobiony na dziś. Brawo!",
      "„{name}” zaliczone. Tak trzymaj!",
    ],
  },
};

const EN: Record<TauntLevel, RescueLines> = {
  hard: {
    rescue: [
      "Yesterday “{name}” went to shit. There's no second time today. {min} is enough.",
      "One day off is an accident. Two is a new habit, and a shitty one. “{name}”: {min} and the chain lives.",
      "You don't have to do it all today. {min} of “{name}” and we're back. You can manage that, damn it?",
      "Yesterday's zero hurts. Today's zero kills the streak. {min}. Now.",
      "Never twice in a row. The one rule you don't break. “{name}”, {min}, now.",
      "Rescue for “{name}”: {min}. Not an hour, not perfect. {min} and cut the bullshit.",
      "Skipping yesterday, I get it. Skipping today is a personality. {min} of “{name}”.",
      "Today's minimum: {min}. Less isn't possible, more isn't required. Move.",
      "The chain is hanging by a thread. {min} of “{name}” and it holds. Zero and it's back to square one, damn it.",
      "A second hole in a row in “{name}”? Over my dead body. {min}, now.",
      "Yesterday “{name}” just lay there. Today, no excuses. Do it, damn it.",
      "Two days in a row without “{name}” isn't a break, it's quitting. Not today.",
      "Never twice in a row. “{name}” today, even if it's half-assed.",
    ],
    rescueAvoid: [
      "Slipped with “{name}” yesterday. Not twice in a row. Confirm a clean day tonight.",
      "One slip is an accident. Two is a lifestyle. “{name}” - clean today, damn it.",
      "After yesterday's “{name}”, today is the test. Don't fuck it up.",
      "Never twice in a row. Yesterday happened, today “{name}” stays outside.",
      "Lost to “{name}” yesterday. Today's the rematch, and you're winning it.",
    ],
    rescuePraise: [
      "Rescued. {min} of “{name}” and the chain holds. That's how you come back.",
      "Minimum done. No medal, but the streak lives. Respect, a little.",
      "{min} and done. Yesterday's dip didn't repeat. Good fucking job.",
      "You're back in the game. “{name}” is fine. The whole thing tomorrow, maybe?",
      "Never twice - done. That's what consistency looks like, not perfection.",
    ],
    focus: [
      "“{name}” is your focus this week. It's just lying there. Seriously, this one?",
      "This week's focus: “{name}”. Chosen by you, ignored by you. Go.",
      "Out of the whole list you have to watch one: “{name}”. One, damn it.",
      "The week has one priority and it's “{name}”. The rest can wait, this can't.",
      "The promised focus “{name}” is giving you a look. So am I.",
      "“{name}” was supposed to matter most this week. So far it's the most ignored.",
      "The weekly focus isn't decoration. “{name}”. Now.",
      "One focus, seven days. “{name}” won't do itself, for fuck's sake.",
    ],
    focusPraise: [
      "This week's focus “{name}” done for today. That's the point.",
      "“{name}” ticked off. The weekly focus is in good hands. For now.",
      "Priority done. The rest of the day is a bonus.",
      "“{name}” done. That's how you build a week, not a list of excuses.",
    ],
  },
  soft: {
    rescue: [
      "“{name}” didn't happen yesterday. Today {min} is enough to get back on track.",
      "Never twice in a row: {min} of “{name}” and the streak goes on.",
      "A rough day? Do at least {min}. It really counts.",
      "Yesterday didn't work out. Today “{name}”, even briefly.",
    ],
    rescueAvoid: [
      "Yesterday was a slip with “{name}”. Try to keep today clean.",
      "After yesterday: no “{name}” today. You can do it.",
    ],
    rescuePraise: [
      "Minimum done - the chain goes on. Well done!",
      "{min} of “{name}” and you're back on track. Great!",
    ],
    focus: [
      "“{name}” is your focus this week. Now's a good moment.",
      "This week's focus is waiting: “{name}”.",
      "Remember this week's focus: “{name}”.",
    ],
    focusPraise: [
      "This week's focus “{name}” done for today. Well done!",
      "“{name}” done. Keep it up!",
    ],
  },
};

export function rescueLines(level: TauntLevel): RescueLines {
  return pick(PL, EN)[level];
}

/** Lines with {name} and {min} filled in (no minimum: only the lines that don't need one). */
export function fillRescue(lines: string[], name: string, min: string): string[] {
  const usable = min ? lines : lines.filter((l) => !l.includes("{min}"));
  return usable.map((l) => l.replaceAll("{name}", name).replaceAll("{min}", min));
}
