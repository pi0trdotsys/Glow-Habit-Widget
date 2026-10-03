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
import { dayGuardState, dayLines } from "@/lib/day-guard";
import { curfewLines } from "@/lib/curfew";
import { shopLines, shopState, type WishItem } from "@/lib/shop";
import type { Habit } from "@/lib/habits/types";
import { L, pick } from "@/lib/i18n";

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
  | "tiktok"
  | "instagram"
  | "threads"
  | "facebook"
  | "youtube"
  | "x"
  | "reddit"
  | "snapchat"
  | "pinterest"
  | "twitch"
  | "linkedin"
  | "generic"
  | "escalate"
  | "block"
  | "pre"
  | "bedtime";

const HARD: Record<LineKey, string[]> = {
  tiktok: [
    "{time} i odpalasz TikToka? Algorytm cię wyrucha na trzy godziny, a rano będziesz wrakiem. Odkładaj to.",
    "TikTok o {time}. Jeszcze jeden filmik, co? Tak mówi każdy ćpun. Idź spać, kurwa.",
    "Pół nocy przewijania pierdolonych tańców. {count}. raz dziś w nocy. Zamknij to gówno.",
    "Chińczycy dziękują za twój sen. Ty jutro nie podziękujesz. Wyłączaj TikToka.",
    "TikTok o {time}. Ten sam taniec po raz czterdziesty, a ty dalej się gapisz. Zamykaj to, kurwa.",
    "{count}. raz TikTok tej nocy. Algorytm zna cię lepiej niż matka. Nie karm go więcej, idź spać.",
    "O {time} TikTok podsuwa ci filmiki, których nawet nie chcesz. A ty i tak oglądasz. Odłóż to.",
    "Zakładka „Dla ciebie” o {time}? Dla ciebie jest teraz poduszka. Wyłączaj, do chuja.",
  ],
  instagram: [
    "Instagram o {time}? Oglądasz cudze idealne życie zamiast naprawiać swoje. Spać.",
    "Znowu stories o {time}. Nikt normalny nic nie wrzuca o tej porze, tylko ty tam siedzisz jak debil.",
    "Insta po północy to prosta droga do kompleksów i worów pod oczami. Odłóż to, kurwa.",
    "{count}. wejście na Instagrama tej nocy. Serio? Zamykaj i do wyra.",
    "Instagram o {time}. Ex, znajomi z liceum, obcy na wakacjach. Wszyscy śpią, tylko ty stalkujesz. Spać.",
    "{count}. raz na Insta tej nocy. Lajki o tej porze nic nie znaczą, a sen znaczy wszystko, kurwa.",
    "Reelsy o {time}? Za kilka godzin budzik, a ty dalej przewijasz cudze śniadania.",
    "Instagram o {time} to festiwal kompleksów. Zamknij to gówno i idź spać.",
  ],
  threads: [
    "Threads o {time}? Nawet boty już śpią. Twoja kolej.",
    "Czytasz kłótnie obcych ludzi w środku nocy. Wybitne. Spać.",
    "Threads o {time}? Kłócisz się w myślach z obcymi. Wyloguj mózg i spać, kurwa.",
    "{count}. raz na Threads tej nocy. Nawet algorytm ziewa. Idź spać.",
  ],
  facebook: [
    "Facebook o {time}? Co ty, wujek po weselu? Zamykaj to i śpij.",
    "Grupy, memy, kłótnie w komentarzach o {time}. Twoje życie zasługuje na więcej. Spać, kurwa.",
    "Facebook o {time}. Grupa „Sprzedam garnki” może poczekać do rana. Spać, kurwa.",
    "{count}. wejście na Facebooka tej nocy. Marketplace o tej porze to sami naciągacze i ty.",
    "Kłótnie pod postem o {time}. Wujek i tak nie zmieni zdania. Ty zmień pozycję na poziomą.",
  ],
  youtube: [
    'YouTube o {time}. "Tylko jeden filmik" - i nagle oglądasz budowę mostów w Norwegii o czwartej. Wyłączaj.',
    "Shortsy po północy to TikTok dla udających, że to nie TikTok. Odkładaj telefon.",
    "Autoplay cię nie kocha. Chce tylko, żebyś nie spał. Zamknij YouTube'a.",
    "YouTube o {time}. Właśnie oglądasz recenzję czegoś, czego nigdy nie kupisz. Wyłączaj, kurwa.",
    "{count}. raz YouTube tej nocy. „Następny film za 5 sekund” - a ty za 5 sekund idziesz spać.",
    "Trzygodzinny podcast o {time}? To nie kołysanka, to porwanie. Zamykaj.",
  ],
  x: [
    "X o {time}? Doomscrolling wojen i idiotów to najgorsza kołysanka świata. Spać.",
    "Czytasz wkurwiających ludzi o {time}, żeby się wkurwić przed snem? Genialne. Zamykaj.",
    "X o {time}. Wojna w komentarzach nie skończy się przez ciebie. Ani przez nikogo. Spać, kurwa.",
    "{count}. raz na X tej nocy. Doomscrolling to nie informowanie się, to tortury na własne życzenie.",
  ],
  reddit: [
    "Reddit o {time}. Jeszcze jeden wątek i jeszcze jeden, aż wstanie słońce. Zamykaj to.",
    "r/wszystko o {time}. Nie jesteś ekspertem od niczego z tego, co czytasz. Idź spać.",
    "{count}. raz Reddit tej nocy. Karma cię nie wyśpi. Zamknij.",
    "Reddit o {time}. Przeczytasz cały wątek o obcym człowieku i rano nic z tego nie zostanie. Spać.",
    "AITA o {time}? Tak, dupkiem jest ten, kto nie śpi o tej porze. Zamykaj, kurwa.",
  ],
  snapchat: [
    "Snapchat o {time}? Nikt normalny nie wysyła teraz snapów. Spać.",
    "Snapchat o {time}. Streak przetrwa, a twój sen nie. Spać, kurwa.",
    "{count}. raz Snapchat tej nocy. Zdjęcie sufitu w ciemności nikomu nie jest potrzebne.",
  ],
  pinterest: [
    "Pinterest o {time}? Wymarzony pokój urządzisz jutro. Teraz śpij w obecnym, kurwa.",
    "Pinterest o {time}. Przepisy, których nie ugotujesz, i ogrody, których nie masz. Spać.",
    "{count}. raz Pinterest tej nocy. Tablica „Moje lepsze życie” zaczyna się od snu, kurwa.",
  ],
  twitch: [
    "Twitch o {time}? Streamer zarabia na tym, że ty nie śpisz. Wyłączaj.",
    "Twitch o {time}. Streamer gra, czat spamuje, a ty płacisz snem. Wyłączaj, kurwa.",
    "{count}. raz Twitch tej nocy. Sub dla streamera, minus dla ciebie. Spać.",
  ],
  linkedin: [
    "LinkedIn o {time}?! Nawet korpo-szczury śpią. Nikt nie da ci awansu za nocne scrollowanie.",
    'Czytasz posty o "pokorze i wdzięczności" o {time}? Idź spać, zanim sam zaczniesz takie pisać.',
    "LinkedIn o {time}. Ktoś właśnie „z dumą ogłasza”, a ty z dumą nie śpisz. Zamykaj, kurwa.",
    "{count}. raz LinkedIn tej nocy. Żaden rekruter nie pisze o tej porze. Idź spać.",
    "Czytasz o „lekcjach z porażki” o {time}? Twoja porażka to brak snu. Lekcja: spać.",
  ],
  generic: [
    "Jest {time}, a ty na {app}? Odłóż telefon i idź spać, do cholery.",
    "{app} o {time}. Ja wszystko widzę. Zamykaj to i do łóżka.",
    "Hej, {u}. {app} w środku nocy to wpadka w toku. Zamknij, zanim się rozkręcisz.",
    "{count}. raz tej nocy na {app}. Czy ty się w ogóle słyszysz? Spać!",
    "{time}, {app} i ty. Toksyczny trójkąt. Zerwij go i idź spać, kurwa.",
    "Hej, {u}, {app} o {time}? Ja wszystko widzę. Telefon na ładowarkę, ty do łóżka.",
    "{count}. raz na {app} tej nocy. Twój kciuk ma więcej nadgodzin niż ty.",
    "{app} o {time}. Nie ma tam nic, czego nie będzie rano. Zamykaj.",
  ],
  escalate: [
    "Już {m} min na {app}. Rano będziesz żałować każdej z nich. Wyłącz to kurestwo.",
    "{m} minut. Wciąż tu jesteś. Ja też. I nie odpuszczę, dopóki nie odłożysz telefonu.",
    '{m} min o {time}. To już nie jest "chwilka", to nałóg. Zamykaj {app}.',
    "Siedzisz na {app} od {m} min. Budzik zadzwoni, a ty będziesz wyglądać jak zombie. Spać!",
    "Kurwa, {m} minut. Poduszka płacze. Odłóż to natychmiast.",
    "{m} min na {app}. Za każdą minutę rano zapłacisz kawą i wkurwieniem. Zamykaj.",
    "Już {m} minut. Ekran świeci ci w ryj jak lampa na przesłuchaniu. Odłóż to, do chuja.",
    "{m} min o {time}. Melatonina właśnie złożyła wypowiedzenie. Zamknij {app}.",
    "{m} minut na {app}, a ja dalej tu jestem. Albo idziesz spać, albo wracam co pięć minut.",
  ],
  // Full-screen block after the 3rd jab (LiveBlock.java).
  block: [
    "Dość tego. {m} minut na {app} o {time}. Trzy szpile zignorowane - teraz ja zamykam ten cyrk.",
    "Koniec, kurwa. Trzy razy prosiłem po dobroci. {app} ma na dziś fajrant, ty też.",
    '{m} minut scrollowania o {time}. Nie, nie "jeszcze chwila". Idziesz spać.',
    "Zablokowane. Chcesz dalej? Przytrzymaj guzik 10 sekund i spójrz sobie w oczy.",
    "Jutro rano podziękujesz. Albo nie. Ale {app} i tak zamykasz.",
    "Fajrant. {m} minut na {app} o {time}. Zamykam ten burdel, a ty idziesz spać.",
    "Blokada. Trzy szpile, zero reakcji. {app} śpi, ty też, kurwa.",
    "Koniec imprezy. {app} zamknięte do rana. Poduszka czeka od godziny.",
  ],
  // Bedtime mode, before the deadline: countdown jabs ({left} minutes to {deadline}).
  pre: [
    "{app}? Za {left} min {deadline}, a ty dopiero się rozkręcasz? Zamykaj to, póki jest łatwo.",
    "Umawialiśmy się: tryb przed snem, telefon idzie w odstawkę. Zostało {left} min. {app} może poczekać do jutra.",
    "Jeszcze {left} min do {deadline}. Każda minuta na {app} teraz to minuta snu mniej. Odłóż to, kurwa.",
    "Tryb przed snem, a ty na {app}? Nie oszukuj się. Za {left} min i tak cię złapię.",
    "Zamknij {app} teraz, a zaśniesz jak człowiek. Za {left} min zaczyna się jazda bez trzymanki.",
    "{app} teraz? Za {left} min {deadline}. Kończ, zanim zrobię się nieprzyjemny. Bardziej niż zwykle.",
    "Zostało {left} min do {deadline}. Ostatnie minuty z {app} zawsze się przeciągają. Odkładaj, kurwa.",
    "Tryb przed snem trwa. {app} kradnie ci {left} min wyciszania. Nie dawaj się.",
  ],
  // The bedtime reminder itself ("odłóż telefon za 30 min").
  bedtime: [
    "Za {left} min {deadline}. Odkładaj telefon, zanim algorytm zje ci noc.",
    "Masz {left} min. Potem każde otwarcie social mediów to szpila, a po trzeciej - blokada. Twój wybór.",
    "Czas się zwijać. {left} min do {deadline}: zęby, woda, telefon na ładowarkę daleko od łóżka.",
    "Ostatnie {left} min z telefonem. Potem nie jestem już miły. Wiem, że nie byłem, ale będzie gorzej.",
    "Za {left} min {deadline}. Zęby, woda, telefon na ładowarkę poza łóżkiem. Rytuał jak u dorosłych, kurwa.",
    "{left} min do {deadline}. Zacznij się zwijać, zanim algorytm zwinie ciebie.",
    "Za {left} min koniec scrollowania. Napisz, co musisz, i odkładaj telefon.",
  ],
};

const SOFT: Record<LineKey, string[]> = {
  tiktok: [
    "TikTok o {time}? Łatwo tu utknąć na długo. Może pora odłożyć telefon?",
    "TikTok o {time}? Ostatni filmik i dobranoc.",
  ],
  instagram: [
    "Instagram o {time} - wszystko to będzie tam też jutro. Czas na sen.",
    "Instagram o {time}? Wszystko poczeka do rana.",
  ],
  threads: ["Threads o {time}? Rozmowy poczekają do rana."],
  facebook: ["Facebook o {time}? Nic ważnego nie ucieknie. Dobranoc!"],
  youtube: [
    "YouTube o {time} - jeden filmik łatwo zamienia się w dziesięć. Może jutro?",
    "YouTube o {time}? Zapisz film na później i idź spać.",
  ],
  x: ["X o {time}? Nocne newsy tylko utrudniają zasypianie."],
  reddit: ["Reddit o {time}? Wątki poczekają. Czas na sen."],
  snapchat: ["Snapchat o {time}? Odpowiesz rano."],
  pinterest: ["Pinterest o {time}? Inspiracje poczekają do jutra."],
  twitch: ["Twitch o {time}? Nagranie obejrzysz jutro."],
  linkedin: ["LinkedIn o {time}? Kariera też potrzebuje snu."],
  generic: [
    "Jest {time}, a ty na {app}. Pora odłożyć telefon i iść spać.",
    "{app} o {time}? Czas na odpoczynek.",
  ],
  escalate: [
    "Już {m} min na {app}. Odłóż telefon - sen jest ważniejszy.",
    "{m} min na {app}. Pora się wyciszyć.",
  ],
  block: ["Już {m} min na {app} o {time}. Czas odłożyć telefon i iść spać."],
  pre: [
    "Za {left} min {deadline}. Może zamkniesz {app} i zaczniesz się szykować do snu?",
    "Za {left} min {deadline}. Dobry moment, żeby zamknąć {app}.",
  ],
  bedtime: [
    "Za {left} min {deadline}. Pora odłożyć telefon i szykować się do snu.",
    "Za {left} min {deadline}. Spokojny wieczór bez telefonu dobrze ci zrobi.",
  ],
};

// English pools - same keys and placeholders as the Polish ones.
const HARD_EN: Record<LineKey, string[]> = {
  tiktok: [
    "{time} and you're opening TikTok? The algorithm will screw you for three hours and you'll be a wreck in the morning. Put it down.",
    "TikTok at {time}. Just one more video, right? That's what every junkie says. Go to sleep, damn it.",
    "Half the night scrolling through fucking dance videos. Visit #{count} tonight. Close that shit.",
    "The algorithm thanks you for your sleep. Tomorrow-you won't. Shut TikTok off.",
    "TikTok at {time}. The same dance for the fortieth time and you're still staring. Close it, damn it.",
    "TikTok visit #{count} tonight. The algorithm knows you better than your mom does. Stop feeding it and go to sleep.",
    "At {time} TikTok is serving you videos you don't even want. And you watch them anyway. Put it down.",
    "The “For You” page at {time}? What's for you right now is a pillow. Shut it off, for fuck's sake.",
  ],
  instagram: [
    "Instagram at {time}? Watching other people's perfect lives instead of fixing yours. Sleep.",
    "Stories again at {time}. Nobody normal posts at this hour, it's just you sitting there like an idiot.",
    "Insta after midnight is the express lane to insecurity and eye bags. Put it down, damn it.",
    "Visit #{count} to Instagram tonight. Seriously? Close it and get to bed.",
    "Instagram at {time}. Your ex, high school classmates, strangers on vacation. Everyone's asleep except you, stalking. Sleep.",
    "Insta visit #{count} tonight. Likes mean nothing at this hour, sleep means everything, damn it.",
    "Reels at {time}? Your alarm goes off in a few hours and you're still scrolling through other people's breakfasts.",
    "Instagram at {time} is an insecurity festival. Close that shit and go to sleep.",
  ],
  threads: [
    "Threads at {time}? Even the bots are asleep. Your turn.",
    "Reading strangers fighting in the middle of the night. Brilliant. Sleep.",
    "Threads at {time}? You're arguing with strangers in your head. Log your brain out and sleep, damn it.",
    "Threads visit #{count} tonight. Even the algorithm is yawning. Go to sleep.",
  ],
  facebook: [
    "Facebook at {time}? What are you, somebody's uncle after a wedding? Close it and sleep.",
    "Groups, memes, comment wars at {time}. Your life deserves better. Sleep, damn it.",
    "Facebook at {time}. The “Pots and Pans for Sale” group can wait till morning. Sleep, damn it.",
    "Facebook visit #{count} tonight. Marketplace at this hour is just scammers and you.",
    "Comment wars at {time}. Your uncle won't change his mind. You change your position to horizontal.",
  ],
  youtube: [
    "YouTube at {time}. “Just one video” - and suddenly you're watching bridge construction in Norway at 4 a.m. Shut it off.",
    "Shorts after midnight are TikTok for people pretending it's not TikTok. Put the phone down.",
    "Autoplay doesn't love you. It just wants you awake. Close YouTube.",
    "YouTube at {time}. You're watching a review of something you'll never buy. Shut it off, damn it.",
    "YouTube visit #{count} tonight. “Next video in 5 seconds” - and in 5 seconds you're going to sleep.",
    "A three-hour podcast at {time}? That's not a lullaby, it's a kidnapping. Close it.",
  ],
  x: [
    "X at {time}? Doomscrolling wars and idiots is the worst lullaby in the world. Sleep.",
    "Reading infuriating people at {time} so you can get pissed off before bed? Genius. Close it.",
    "X at {time}. The comment war won't end because of you. Or anyone. Sleep, damn it.",
    "X visit #{count} tonight. Doomscrolling isn't staying informed, it's torture you signed up for.",
  ],
  reddit: [
    "Reddit at {time}. One more thread, and another, until the sun comes up. Close it.",
    "r/everything at {time}. You're not an expert on anything you're reading. Go to sleep.",
    "Reddit visit #{count} tonight. Karma won't get you any sleep. Close it.",
    "Reddit at {time}. You'll read a whole thread about a total stranger and remember none of it in the morning. Sleep.",
    "AITA at {time}? Yes, the asshole is whoever's still awake at this hour. Close it, damn it.",
  ],
  snapchat: [
    "Snapchat at {time}? Nobody normal sends snaps now. Sleep.",
    "Snapchat at {time}. The streak will survive, your sleep won't. Sleep, damn it.",
    "Snapchat visit #{count} tonight. Nobody needs a photo of your ceiling in the dark.",
  ],
  pinterest: [
    "Pinterest at {time}? Decorate your dream room tomorrow. Tonight, sleep in the one you've got, damn it.",
    "Pinterest at {time}. Recipes you won't cook and gardens you don't have. Sleep.",
    "Pinterest visit #{count} tonight. The “My Better Life” board starts with sleep, damn it.",
  ],
  twitch: [
    "Twitch at {time}? The streamer gets paid while you don't sleep. Shut it off.",
    "Twitch at {time}. The streamer plays, chat spams, and you pay with your sleep. Shut it off, damn it.",
    "Twitch visit #{count} tonight. A sub for the streamer, a minus for you. Sleep.",
  ],
  linkedin: [
    "LinkedIn at {time}?! Even corporate rats sleep. Nobody's promoting you for night scrolling.",
    "Reading posts about “humility and gratitude” at {time}? Go to sleep before you start writing them.",
    "LinkedIn at {time}. Someone is “thrilled to announce” and you're thrilled to be awake. Close it, damn it.",
    "LinkedIn visit #{count} tonight. No recruiter messages at this hour. Go to sleep.",
    "Reading about “lessons from failure” at {time}? Your failure is not sleeping. Lesson: sleep.",
  ],
  generic: [
    "It's {time} and you're on {app}? Put the phone down and go to sleep, damn it.",
    "{app} at {time}. I see everything. Close it and get to bed.",
    "Hey, {u}. {app} in the middle of the night is a slip in progress. Close it before you get going.",
    "Visit #{count} to {app} tonight. Can you even hear yourself? Sleep!",
    "{time}, {app} and you. A toxic love triangle. Break it off and go to sleep, damn it.",
    "Hey, {u}, {app} at {time}? I see everything. Phone on the charger, you in bed.",
    "Visit #{count} to {app} tonight. Your thumb is pulling more overtime than you ever do.",
    "{app} at {time}. There's nothing there that won't still be there in the morning. Close it.",
  ],
  escalate: [
    "{m} min on {app} already. You'll regret every one of them in the morning. Shut that shit off.",
    "{m} minutes. You're still here. So am I. And I won't let up until you put the phone down.",
    "{m} min at {time}. This isn't “just a sec” anymore, it's an addiction. Close {app}.",
    "You've been on {app} for {m} min. The alarm will ring and you'll look like a zombie. Sleep!",
    "Fuck, {m} minutes. Your pillow is crying. Put it down right now.",
    "{m} min on {app}. Every one of them gets paid back tomorrow in coffee and rage. Close it.",
    "{m} minutes already. The screen is in your face like an interrogation lamp. Put it down, for fuck's sake.",
    "{m} min at {time}. Your melatonin just handed in its notice. Close {app}.",
    "{m} minutes on {app} and I'm still here. Either you go to sleep or I come back every five minutes.",
  ],
  block: [
    "That's it. {m} minutes on {app} at {time}. Three jabs ignored - now I'm shutting this circus down.",
    "Done, damn it. I asked nicely three times. {app} is off duty for the night, and so are you.",
    "{m} minutes of scrolling at {time}. No, not “just a sec”. You're going to sleep.",
    "Blocked. Want to keep going? Hold the button for 10 seconds and take a good look at yourself.",
    "You'll thank me in the morning. Or not. But {app} is closing either way.",
    "Closing time. {m} minutes on {app} at {time}. I'm shutting this shitshow down and you're going to sleep.",
    "Blocked. Three jabs, zero reaction. {app} is asleep, and so are you, damn it.",
    "Party's over. {app} is closed till morning. Your pillow has been waiting for an hour.",
  ],
  pre: [
    "{app}? {left} min till {deadline} and you're just getting started? Close it while it's still easy.",
    "We had a deal: bedtime mode, phone goes away. {left} min left. {app} can wait till tomorrow.",
    "{left} min till {deadline}. Every minute on {app} now is a minute of sleep gone. Put it down, damn it.",
    "Bedtime mode and you're on {app}? Don't kid yourself. In {left} min I'll catch you anyway.",
    "Close {app} now and you'll fall asleep like a human. In {left} min the gloves come off.",
    "{app} now? {left} min till {deadline}. Wrap it up before I get nasty. Nastier than usual.",
    "{left} min left till {deadline}. The last minutes on {app} always drag on. Put it down, damn it.",
    "Bedtime mode is on. {app} is stealing {left} min of your wind-down. Don't let it.",
  ],
  bedtime: [
    "{left} min till {deadline}. Put the phone away before the algorithm eats your night.",
    "You've got {left} min. After that every social media app you open gets a jab, and after the third - a block. Your call.",
    "Time to wrap up. {left} min till {deadline}: teeth, water, phone on the charger far from the bed.",
    "Last {left} min with the phone. After that I stop being nice. I know I never was, but it gets worse.",
    "{left} min till {deadline}. Teeth, water, phone on the charger away from the bed. A grown-up ritual, damn it.",
    "{left} min till {deadline}. Start wrapping up before the algorithm wraps you up.",
    "{left} min until scrolling ends. Send what you need to send and put the phone down.",
  ],
};

const SOFT_EN: Record<LineKey, string[]> = {
  tiktok: [
    "TikTok at {time}? It's easy to get stuck here for ages. Maybe time to put the phone down?",
    "TikTok at {time}? One last video and good night.",
  ],
  instagram: [
    "Instagram at {time} - it'll all still be there tomorrow. Time for sleep.",
    "Instagram at {time}? It'll all wait till morning.",
  ],
  threads: ["Threads at {time}? The conversations can wait till morning."],
  facebook: ["Facebook at {time}? Nothing important will run away. Good night!"],
  youtube: [
    "YouTube at {time} - one video easily turns into ten. Maybe tomorrow?",
    "YouTube at {time}? Save the video for later and get some sleep.",
  ],
  x: ["X at {time}? Late-night news only makes it harder to fall asleep."],
  reddit: ["Reddit at {time}? The threads will wait. Time for sleep."],
  snapchat: ["Snapchat at {time}? You can reply in the morning."],
  pinterest: ["Pinterest at {time}? The inspiration will keep till tomorrow."],
  twitch: ["Twitch at {time}? You can watch the replay tomorrow."],
  linkedin: ["LinkedIn at {time}? Your career needs sleep too."],
  generic: [
    "It's {time} and you're on {app}. Time to put the phone down and go to sleep.",
    "{app} at {time}? Time to rest.",
  ],
  escalate: [
    "{m} min on {app} already. Put the phone down - sleep matters more.",
    "{m} min on {app}. Time to wind down.",
  ],
  block: ["{m} min on {app} at {time}. Time to put the phone down and go to sleep."],
  pre: [
    "{left} min till {deadline}. Maybe close {app} and start getting ready for bed?",
    "{left} min till {deadline}. A good moment to close {app}.",
  ],
  bedtime: [
    "{left} min till {deadline}. Time to put the phone down and get ready for bed.",
    "{left} min till {deadline}. A calm evening without the phone will do you good.",
  ],
};

/** Lines for the native guard: per-app pools + generic + escalation (placeholders resolved natively). */
export function liveLines(
  level: TauntLevel,
  userName: string | null,
  humor: HumorId = "wredny",
): Record<string, string[]> {
  const base = level === "soft" ? pick(SOFT, SOFT_EN) : pick(HARD, HARD_EN);
  const extra = level === "soft" ? { first: [], escalate: [] } : humorLive(humor);
  const u = (l: string) => l.replaceAll("{u}", userName || L("ty", "you"));
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
export function liveState(
  n: NotificationSettings,
  level: TauntLevel,
  userName: string | null,
  humor?: HumorId,
  habits: Habit[] = [],
  wishlist: WishItem[] = [],
) {
  return {
    // Morning lock + daily limit (DayGuard.java).
    ...dayGuardState(n, habits),
    // "24 h do namysłu" for shopping apps (ShopGuard.java).
    shop: shopState(n, wishlist),
    enabled: n.live,
    block: n.liveBlock,
    bedtime: n.bedtime,
    bedtimeAt: toMin(n.bedtimeAt),
    from: toMin(n.liveFrom),
    until: toMin(n.liveUntil),
    off: n.liveOff,
    // Curfew after the deadline (LiveGuardService.curfewBlock).
    curfew: n.curfew ?? false,
    curfewAllow: n.curfewAllow ?? [],
    curfewDim: n.curfewDim ?? true,
    lines: {
      ...liveLines(level, userName, humor),
      ...dayLines(level, userName),
      ...curfewLines(level),
      ...shopLines(level),
    },
  };
}

/** Minutes from now until target (minutes of day), across midnight. Mirrors LiveGuard.minutesTo. */
export function minutesTo(now: number, target: number): number {
  return (((target - now) % 1440) + 1440) % 1440;
}

/** When the guard starts: bedtime if it's before the deadline that night (< 12 h), else the deadline. */
export function guardStart(bedtimeOn: boolean, bedtime: number, deadline: number): number {
  const lead = minutesTo(bedtime, deadline);
  return bedtimeOn && lead > 0 && lead < 720 ? bedtime : deadline;
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
  /** Social media minutes per day (05:00 .. bedtime), for the daily limit. */
  day?: Record<string, number>;
  /** Guard phase right now. */
  phase?: "off" | "night" | "morning" | "day";
  morningBlocks?: Record<string, number>;
  curfewBlocks?: Record<string, number>;
  curfewPasses?: Record<string, number>;
  /** The daily limit as set, and what last night took off it today. */
  limitBase?: number;
  debt?: number;
  /** "Bank minut": the mode, minutes earned today (capped), today's actual limit. */
  limitMode?: "fixed" | "bank";
  bankEarned?: number;
  limit?: number;
  /** The day's actual limit per day ("yyyy-MM-dd" -> min; the bank's balance in bank mode). */
  dayLimit?: Record<string, number>;
  /** "24 h do namysłu", per calendar day: blocks, held-through passes, "add to the list" taps. */
  shopBlocks?: Record<string, number>;
  shopPasses?: Record<string, number>;
  shopWish?: Record<string, number>;
  /** Shopping pass end (ms), 0 = none. */
  shopPassUntil?: number;
  shopApps?: LiveApp[];
}

interface LivePlugin {
  liveStatus(): Promise<LiveStatus>;
  openOverlaySettings(): Promise<void>;
  curfewApps(): Promise<{ apps: CurfewApp[] }>;
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

export interface CurfewApp {
  pkg: string;
  label: string;
  social: boolean;
}

/** Launchable apps for the curfew's allow list (always-allowed ones left out). */
export async function curfewApps(): Promise<CurfewApp[]> {
  if (!Capacitor.isNativePlatform()) return [];
  try {
    const r = await Native.curfewApps();
    return r.apps ?? [];
  } catch {
    return [];
  }
}
