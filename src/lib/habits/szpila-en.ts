// English Szpila lines - same shapes and keys as the Polish tables in
// szpila.ts and szpila-more.ts, chosen at call time (see T() in szpila.ts).
// Not literal translations: rewritten so they land in English. Same rules:
// gender-neutral, swearing aimed at the behaviour, never at groups of people.
// Placeholders must match the Polish pools ({name}, {u}, {done}, {left},
// {target}, {pending}, {m}, {after}); lines with {done}/{left}/{target} only
// sit in the pools whose Polish lines use them (usable() filters them).
import type { BaseCategory, Category, Lines } from "./szpila";
import type { TauntLevel } from "./store";

interface MoreLines {
  nag?: string[];
  praise?: string[];
  slip?: string[];
}

export const HARD_EN: Record<BaseCategory, Lines> = {
  teeth: {
    nag: [
      "Teeth still not brushed? With breath like that, the only one who'll get close is your dentist, and they'll charge you, damn it.",
      "Your toothbrush is crying in the bathroom. Get your ass in there and brush.",
      "I can smell your mouth through the screen. Teeth. Now.",
      "Cavities are pitching tents in there. Go scrub, for fuck's sake.",
      "Two minutes of brushing and you can't even manage that? Unbelievable. Damn.",
    ],
    praise: [
      "Teeth brushed. No medal, that's basic hygiene, but fine.",
      "Finally. Your dentist just lost a boat payment.",
      "Clean. People can stand near you when you talk again.",
    ],
  },
  water: {
    nag: [
      "{done} of {target} down. A cactus drinks more than you, you dried-up prune.",
      "Your brain is drying out, that's why you think so slowly. Glass of water. Now, damn it.",
      "{left} to go. The tap is two steps away, lazybones.",
      "Drink the damn water before you shrivel up like a discount raisin.",
      "Pee the shade of strong tea is not an achievement. Drink, for fuck's sake.",
    ],
    praise: [
      "Hydration done. You may now sprint to the toilet with pride.",
      "All the water's down. The houseplants are jealous.",
    ],
  },
  steps: {
    nag: [
      "{done} steps? A robot vacuum does that in an hour. Move your ass.",
      "{left} to go. The couch is not your life partner, damn it.",
      "Your legs are going to wither away like a snake's. Go for a walk.",
      "Your step counter is embarrassed to count these pathetic little shuffles.",
      "{left} to go. The trip to the fridge doesn't count as a walk, for fuck's sake.",
    ],
    praise: [
      "Steps done. Your ass left the chair for a while. Congrats.",
      "Step goal smashed. Turns out the legs work. Who knew.",
    ],
  },
  reading: {
    nag: [
      "The book is gathering dust while you scroll reels like a zombie.",
      "{left} of reading left. Letters don't bite. Unlike me.",
      "The longest thing you've read today is a meme caption. Pathetic, damn it.",
      "Your brain is rotting from that screen. Open the fucking book already.",
    ],
    praise: [
      "Reading done. There's hope for you yet.",
      "Pages read. Your brain got something better than memes today.",
    ],
  },
  gym: {
    nag: [
      "Muscles don't build themselves, and that belly is only fit for sumo.",
      "Your dumbbells will rust before your motivation shows up. Go train, damn it.",
      "“{name}” is waiting while you melt into the couch like jelly.",
      "Sweat is fat crying. Nothing's crying today except me. Get your ass moving.",
    ],
    praise: [
      "Workout done. Don't post it, nobody gives a shit.",
      "Done. You look slightly less like a sack of potatoes.",
    ],
  },
  meditation: {
    nag: [
      "Breathe in, breathe out, and go meditate before your nerves snap.",
      "Five minutes of silence in your head. For you that's a damn world record.",
      "“{name}” still not done. Inner peace won't deliver itself.",
    ],
    praise: ["Zen achieved. For a few minutes you stopped acting like a lunatic."],
  },
  sleep: {
    nag: [
      "“Just five more minutes,” said every zombie ever. Bed. Now, damn it.",
      "The bags under your eyes could go on holiday as checked luggage. Sleep.",
    ],
    praise: ["Well rested. Maybe today you won't look like roadkill."],
  },
  pills: {
    nag: [
      "Your vitamins won't swallow themselves. Do I really have to tell a grown adult this?",
      "“{name}” is still in the packet. Take it already, damn it.",
    ],
    praise: ["Swallowed. Wow, you can wash down a pill with water."],
  },
  learning: {
    nag: [
      "“{name}” is waiting. Ignorance doesn't hurt, but it shows from a mile away.",
      "{left} to go. I've heard your “I'll learn it tomorrow” for weeks, damn it.",
    ],
    praise: ["Study done. The odds of you getting any dumber just dropped."],
  },
  generic: {
    nag: [
      "“{name}” is still waiting. Think it'll do itself? It fucking won't.",
      "Lying around looking pretty while “{name}” sits undone.",
      "This is what people who start “on Monday” look like. “{name}”. Now.",
      "“{name}”. {left} to go. Get your shit together.",
    ],
    praise: [
      "“{name}” done. Don't get used to compliments.",
      "Done. Shock and disbelief, but done.",
    ],
  },
  phone: {
    nag: [
      "No confirmation that tonight's scroll-free. Tick it, or I'll assume you're up till 3 a.m. like an idiot.",
      "Put the fucking phone down and confirm no late-night screen time tonight.",
      "Mole eyes from staring at the screen. Confirm you're going to bed at a human hour.",
      "No confirmation means I assume you're under the covers with your phone again. That's how it works, damn it.",
    ],
    praise: [
      "An evening without the phone? Impossible. The battery must have died.",
      "Confirmed. Your brain gets a night off from internet garbage.",
    ],
    slip: [
      "Up all night on the phone again. You'll look like a kicked puppy in the morning.",
      "Late-night scrolling limit blown. Congrats, champion of excuses.",
    ],
  },
  fastfood: {
    nag: [
      "No confirmation that today's fast-food free. Tick it, or I'll assume you're stuffing your face with burgers.",
      "Deep fryer calling your name? Confirm you skipped the junk today.",
      "No confirmation means it got eaten. I can already see the grease on your fingers, damn it.",
      "Confirm no fast food today, or I'm signing you up as a drive-thru regular.",
    ],
    praise: [
      "A day without fast food. Your arteries are sending a thank-you card.",
      "Clean. The kebab delivery guy is crying outside your building.",
    ],
    slip: [
      "Fast food again. Your ass is growing faster than your willpower.",
      "Fast-food limit blown. Bravo, supersize for the champ.",
    ],
  },
  sweets: {
    nag: [
      "Confirm no sweets today, or I'll assume you're scarfing chocolate in secret, damn it.",
      "Sugar is not a food group. Confirm you skipped the candy today.",
    ],
    praise: ["A day without sweets. Your pancreas is giving you a standing ovation."],
    slip: ["Sweets again. Diabetes is rubbing its hands together, damn it."],
  },
  alcohol: {
    nag: [
      "Confirm you're sober today, because without it I'll assume the beer's already open.",
      "Your liver is waiting for good news. Confirm no booze today, damn it.",
    ],
    praise: ["A sober day. Your liver finally gets a day off."],
    slip: ["Drinking again. Your liver just handed in its resignation."],
  },
  smoking: {
    nag: [
      "Confirm no cigarettes today, or I'll assume you're puffing away like an old chimney.",
      "Your lungs are waiting for confirmation. Tick that today's smoke-free, damn it.",
    ],
    praise: ["A smoke-free day. Your lungs can finally breathe properly."],
    slip: ["Smoking again. The tar in your lungs is popping champagne, damn it."],
  },
  games: {
    nag: [
      "Confirm no gaming till you drop today, or I'll assume the controller has grown into your hands, damn it.",
    ],
    praise: ["A day without games. Turns out real life has better graphics."],
    slip: ["Gaming again. Real-life level: still 1, damn it."],
  },
  social: {
    nag: ["Confirm no mindless scrolling today, or I'll assume you're rotting on reels, damn it."],
    praise: ["A day without reels. Your attention span finally beat a goldfish's."],
    slip: ["Reels again. The algorithm screwed you today and you're thanking it."],
  },
  avoidGeneric: {
    nag: [
      "“{name}” - confirm you didn't today, or I'll assume you did. Those are the rules, damn it.",
      "No confirmation on “{name}” = fail. Tick it if your conscience is clean.",
    ],
    praise: ["“{name}” - clean today. I don't believe it, but I'll take it."],
    slip: ["“{name}” - again. Willpower of a drunk pigeon."],
  },
};

export const SOFT_EN: Record<BaseCategory, Lines> = {
  teeth: {
    nag: [
      "Your teeth are still waiting for the toothbrush. Two minutes, you can do it.",
      "The toothbrush misses you. Brush your teeth before the dentist finds out.",
    ],
    praise: ["Teeth brushed. A smile worth a medal."],
  },
  water: {
    nag: [
      "{done} of {target} down. {left} to go - your body will thank you.",
      "Time for a glass of water. Your brain likes being hydrated.",
    ],
    praise: ["All the water's down. Great!"],
  },
  steps: {
    nag: [
      "You're at {done} steps, {left} to go. A short walk will do it.",
      "Get up and stretch your legs. {left} to go.",
    ],
    praise: ["Step goal reached. Your legs say thanks!"],
  },
  reading: {
    nag: ["Your book is waiting. {left} of reading to go.", "A few pages before bed? Good moment."],
    praise: ["Reading done. Well done!"],
  },
  gym: {
    nag: [
      "“{name}” is waiting. Even a short workout counts.",
      "Moving is healthy. Time for “{name}”.",
    ],
    praise: ["Workout done. Respect!"],
  },
  meditation: {
    nag: ["A few quiet minutes will do you good. Time for “{name}”."],
    praise: ["Meditation done. Inner peace +1."],
  },
  sleep: {
    nag: ["Time to get some sleep. You'll thank yourself tomorrow."],
    praise: ["Well rested. Keep it up!"],
  },
  pills: { nag: ["Don't forget “{name}”."], praise: ["Taken. Nice work."] },
  learning: {
    nag: ["“{name}” is waiting. {left} to go."],
    praise: ["Study done. A little smarter every day!"],
  },
  generic: {
    nag: ["“{name}” is waiting for you.", "Time for “{name}”. {left} to go."],
    praise: ["“{name}” done. Keep it up!"],
  },
  phone: {
    nag: ["Confirm no late-night phone time tonight. Without it, I count a slip."],
    praise: ["An evening without the phone. Your brain gets to rest."],
    slip: ["Up late with the phone again. Try putting it down earlier tomorrow."],
  },
  fastfood: {
    nag: ["Confirm no fast food today. Without a confirmation, I count a slip."],
    praise: ["A day without fast food. Well done!"],
    slip: ["Fast food happened. Tomorrow is a new day."],
  },
  sweets: {
    nag: ["Confirm no sweets today."],
    praise: ["A day without sweets. Great!"],
    slip: ["Sweets happened. Better tomorrow."],
  },
  alcohol: {
    nag: ["Confirm no alcohol today."],
    praise: ["A day without alcohol. Great!"],
    slip: ["Alcohol happened. Fresh start tomorrow."],
  },
  smoking: {
    nag: ["Confirm no cigarettes today."],
    praise: ["A day without a cigarette. Your lungs say thanks!"],
    slip: ["A cigarette happened. Don't give up."],
  },
  games: {
    nag: ["Confirm no gaming today."],
    praise: ["A day without games. Well done!"],
    slip: ["Gaming happened. Better tomorrow."],
  },
  social: {
    nag: ["Confirm no scrolling today."],
    praise: ["A day without scrolling. Great!"],
    slip: ["Scrolling happened. Better tomorrow."],
  },
  avoidGeneric: {
    nag: ["“{name}” - confirm you didn't today. Without it, I count a slip."],
    praise: ["“{name}” - clean today. Well done!"],
    slip: ["“{name}” happened. Tomorrow is a new day."],
  },
};

/** Escalation tier - same keys as RAGE_HARD (the fallback depends on them). */
export const RAGE_HARD_EN: Partial<Record<Category, string[]>> = {
  teeth: [
    "For fuck's sake, teeth still not brushed. Soon they'll fall out on their own, out of sheer grief.",
    "How many damn times do I have to remind you about the toothbrush? Bathroom. Now.",
  ],
  water: [
    "{done} of {target}. Holy shit, a camel in the desert is better hydrated.",
    "{left} to go and you're still acting like water is poison. Drink, for fuck's sake.",
  ],
  steps: [
    "{done} steps at this hour? A pensioner with a walker is lapping you. Move your ass right now.",
    "{left} to go. Get off that couch before you fuse with it for good, damn it.",
  ],
  reading: [
    "The book's been untouched all day. Your brain is melting like cheese on toast.",
    "{left} of reading left and you're scrolling shit online. The whole family's ashamed.",
  ],
  gym: [
    "Workout ignored for hours. Your muscles are suing you for neglect, damn it.",
    "The dumbbells are crying, the couch is celebrating. Guess who's losing at life.",
  ],
  phone: [
    "Still no confirmation. I'm assuming the worst: nose in the screen like the last zombie on earth.",
  ],
  fastfood: [
    "A whole day without confirmation. I can smell the fries through this phone, damn it.",
  ],
  generic: [
    "“{name}” has been sitting there for hours. Seriously? How the fuck can anyone be this lazy?",
    "Still nothing on “{name}”. My patience is gone, only the swearing is left.",
  ],
  avoidGeneric: [
    "“{name}” still unconfirmed. I'm assuming you went off the rails. Prove me wrong.",
  ],
};

export const RAGE_SOFT_EN = [
  "“{name}” has been waiting a long time. Now is a really good moment to do it.",
  "Still no “{name}”. Do even a little - every step counts.",
];

export const CAUGHT_EN: Record<TauntLevel, string[]> = {
  hard: [
    "For fuck's sake, {m} minutes on the phone after {after}. Think I can't see? I see everything. Slip.",
    "After {after} you were supposed to sleep, instead it's {m} minutes of scrolling. Slip logged, go to bed, damn it.",
    "Night patrol reports: {m} minutes of screen after {after}. Don't whine about being tired in the morning.",
    "Caught you! {m} min on the phone after {after}. Slip logged, and you'll look like shit in the morning.",
    "Gotcha, night owl. {m} min of scrolling after {after}. Put that damn thing down and go to sleep.",
  ],
  soft: [
    "{m} min on the phone after {after} - logging a slip. Time to put the phone down and sleep.",
  ],
};

export const CAUGHT_SOCIAL_EN: Record<TauntLevel, string[]> = {
  hard: [
    "Gotcha! {m} min of social media after {after}. Slip logged. Alarm, music - fine. TikTok and Insta - no.",
    "{m} minutes of social media scrolling after {after}. That wasn't the alarm, that was an addiction. Slip.",
    "I see everything: {m} min of social media after {after} - Insta, YouTube, the lot. Put that shit down and sleep.",
  ],
  soft: ["{m} min on social media after {after} - logging a slip. Time to put the phone down."],
};

export const ALL_DONE_EN: Record<TauntLevel, string[]> = {
  hard: [
    "Mrrr. Everything done. I'm going to nap on your keyboard, I've earned it.",
    "Full set. I'm purring reluctantly, but I'm purring.",
    "All ticked off. Fuck, I don't know what to do with my life now.",
    "Full set. Go celebrate, just not with fast food, because I'll be right back.",
    "Zero backlog. I feel unemployed. Thanks a fucking lot.",
    "Whole day done. I'll be back tomorrow with fresh venom, don't get too happy.",
    "Everything done. Nothing left to pick on and it pisses me off.",
    "Full set for today. Leave now, before you screw something up.",
    "Whole day done. Even I'm impressed, and that's damn hard.",
  ],
  soft: ["Everything done for today. Great job!", "Full set! Time to rest."],
};

export const EVENING_EN: Record<TauntLevel, string[]> = {
  hard: [
    "Night's almost here and you've still got {pending}. Holy shit, last minute as usual.",
    "Evening, and there's still {pending} on the list. Move, or tomorrow's shame comes doubled.",
    "{pending} to do and a few hours till midnight. Less talking, more doing, damn it.",
    "The day's ending and you've still got {pending} left. The whole neighborhood is embarrassed.",
    "{pending} left and a few hours to go. Move your ass or you'll be making excuses again tomorrow.",
  ],
  soft: ["{pending} left for today. There's still time!"],
};

export const EMPTY_EN: Record<TauntLevel, string[]> = {
  hard: ["Zero tasks? You're not even trying. Add something, lazybones."],
  soft: ["Add your first task and I'll take care of the rest."],
};

// ---------------------------------------------------------------------------
// Extra bank (mirrors szpila-more.ts)
// ---------------------------------------------------------------------------

export const MORE_HARD_EN: Partial<Record<Category, MoreLines>> = {
  teeth: {
    nag: [
      "Your breath could peel wallpaper. Brush your damn teeth.",
      "The bacteria in your mouth have unionized and want a raise. Toothbrush, now.",
      "Kissing anyone tonight? No? Then brush that crap off your teeth for your own sake.",
      "Your dentist is already booking a holiday on your fillings. Don't give them the satisfaction. Brush.",
      "Two minutes. A hundred and twenty seconds. Even you can manage that, for fuck's sake.",
      "Teeth unbrushed and you're pretending to be a functioning adult. Holy shit.",
    ],
    praise: [
      "Teeth brushed. At least you won't kill anyone with your breath today.",
      "Scrubbed. The cavities are running off with their tails between their legs.",
      "See? It's damn possible. Clean teeth.",
    ],
  },
  water: {
    nag: [
      "{done} of {target}. Your kidneys are writing a farewell letter, damn it.",
      "You're 60% water and acting like you're made of stale bread. Drink.",
      "{left} to go. It's not a PhD, it's a glass of fucking water.",
      "Coffee isn't water, energy drinks aren't water, and beer sure as hell isn't water. Drink water, genius.",
      "Headache? Tired? Guess how much water you've had. {done}. Well done, genius.",
      "Even the fern on the windowsill is better hydrated than you, damn it.",
      "The tap doesn't bite. Turn, pour, drink. Three steps, and you've been fucking around all day.",
    ],
    praise: [
      "All the water's down. Your kidneys are dropping the lawsuit.",
      "Hydration complete. Now you'll pee every half hour, but at least like a proper human.",
      "Full tank of water. Even I'm shocked, damn it.",
    ],
  },
  steps: {
    nag: [
      "{done} steps. I do that much and I'm a cat who sleeps 16 hours a day, damn it.",
      "{left} to go. Couch to fridge and back isn't a workout, genius.",
      "Your ass has a chair-shaped dent in it. Get up and walk.",
      "Your step counter thinks your phone is in a drawer. Nope, just your laziness, damn it.",
      "Legs are for walking, not for holding a laptop. Get outside, for fuck's sake.",
      "Elevator, car, couch. Your daily triathlon of laziness. Move, damn it.",
    ],
    praise: [
      "Steps done. The couch is crying alone.",
      "Step goal reached. Your legs worked harder than your brain today.",
      "Done. Even the neighbors saw you outside. Shocking, damn it.",
    ],
  },
  reading: {
    nag: [
      "The last thing you read was the back of a bag of chips. Open a book, for fuck's sake.",
      "{left} of reading left. The brain is a muscle and yours looks like it spent a year in a cast.",
      "The book is staring at you with contempt. So am I.",
      "TikTok won't make you smarter. A book might. Read, damn it.",
      "Twenty minutes. Not three hours. Twenty fucking minutes with a book.",
    ],
    praise: [
      "Read. Your brain got something other than internet garbage today.",
      "Reading done. Keep it up and you'll start using big words.",
      "Pages turned. IQ up half a point. Damn, success.",
    ],
  },
  gym: {
    nag: [
      "The workout is waiting and you've got the muscle tone of an overcooked noodle. Move your ass.",
      "Muscles are shrinking, fat is moving in. Go train, damn it.",
      "Your gym membership is the most expensive souvenir in your wallet. Go use it.",
      "“{name}” has been waiting since morning. Excuses are lighter than dumbbells, but they get you jack shit.",
      "Sweat or shame. Picking shame today? Seriously, for fuck's sake?",
    ],
    praise: [
      "Workout done. Respect, but please, no gym selfie.",
      "Done. Your muscles just remembered they exist.",
      "Drenched. Even I have to admit it: damn good work.",
    ],
  },
  meditation: {
    nag: [
      "Your head's a mess like the morning after New Year's. Five minutes of quiet, for fuck's sake.",
      "You're breathing like a steam train. Sit down, shut up and breathe slowly.",
      "Nerves shot and meditation skipped. Know what that gets you? Pissed off.",
      "“{name}” is waiting. Inner peace doesn't come in a box, you have to sit with it.",
    ],
    praise: ["Meditated. For a moment it was quiet in your head. A damn miracle."],
  },
  sleep: {
    nag: [
      "Your body is begging for sleep and you're still messing around. Bed.",
      "Tomorrow you'll be the walking dead. Go to sleep before it's too late, damn it.",
      "Sleep isn't for the weak. It's the only way not to look like shit.",
    ],
    praise: ["Well rested. Today you look like a person, not a zombie."],
  },
  pills: {
    nag: [
      "The pill's just lying there. Think it'll absorb through your skin? Swallow it, damn it.",
      "Vitamins in a drawer don't work. They work in your stomach. Take them.",
      "“{name}” skipped. Then you wonder why everything aches.",
    ],
    praise: ["Swallowed. Your body got something better than chips today."],
  },
  learning: {
    nag: [
      "Your brain will rust like an old bike in the basement. Study, damn it.",
      "“{name}” is waiting. Learning doesn't hurt. Not knowing at the worst moment does.",
      "The Duolingo owl has put a hit out on you. Better sit down and study.",
      "{left} to go. Tomorrow you won't remember twice as much, so today, for fuck's sake.",
    ],
    praise: ["Study done. Soon you'll stop pretending you understand."],
  },
  generic: {
    nag: [
      "“{name}” is waiting and you're waiting for a miracle. There won't be one, damn it.",
      "Mrrr. “{name}” still not done. Even I, a cat, have more ambition, and I sleep 16 hours a day.",
      "I'm staring at you like a cat at an empty bowl. “{name}”. Now, damn it.",
      "I'll knock your mug off the table if you don't do “{name}”. I mean it.",
      "“{name}”. Not done. Again. For fuck's sake, how long can this go on?",
      "Tomorrow, you say? Tomorrow is your favorite lie. “{name}”, today.",
      "“{name}” won't do itself, and I won't shut up by myself. Choose.",
      "Motivation is a scam. Do “{name}” without it, like an adult.",
      "{left} to go on “{name}”. Stop bullshitting and start doing.",
      "I'm embarrassed for you. Seriously. “{name}” is just lying there, rotting.",
    ],
    praise: [
      "“{name}” done. Don't think I'll stop nagging now.",
      "Done. Well damn, maybe you'll amount to something after all.",
      "“{name}” ticked off. A rare sight, I'll mark it on the calendar.",
    ],
  },
  phone: {
    nag: [
      "You scroll like a hypnotized hamster. Confirm no late-night phone tonight, or I'm logging a slip.",
      "Night scrolling is turning your brain to jelly. Tick that you're skipping it tonight, damn it.",
      "Screen blasting your face at 2 a.m., then whining about being tired. Confirm: not tonight.",
      "No confirmation means you're lying there with the phone on your face till 3 again. Tick it or go the fuck to sleep.",
      "The bed is for sleeping, not scrolling reels till 3, damn it. Put the phone across the room.",
      "Phone in bed is a recipe for a 7 a.m. zombie. Tick that you're skipping it, for fuck's sake.",
    ],
    praise: [
      "An evening without the phone. Your eyes get a rest and I don't trust my own sensors.",
      "Phone down. The algorithms made zero off you tonight. Ha!",
    ],
    slip: [
      "Night scrolling again. Morning eyes like two holes in the snow and the mood of a funeral.",
      "2 a.m. and you're still on the phone. Holy shit, tomorrow will be a disaster.",
      "Phone slip. Congrats, another half a night handed to the internet for free, damn it.",
    ],
  },
  fastfood: {
    nag: [
      "Confirm no fast food today. I have a feeling there's a burger sizzling with your name on it, damn it.",
      "Fries aren't a vegetable, ketchup isn't a salad. Tick that today's clean.",
      "No confirmation means I assume you're eating out of a paper bag in the car. Tick it if not.",
      "Your arteries clog just thinking about a supersized meal. Confirm: not today.",
    ],
    praise: [
      "A day without fast food. Your heart just high-fived you.",
      "Clean. The drive-thru guy is crying into the till.",
    ],
    slip: [
      "Fast food again. Your stomach is a discount dumpster at this point.",
      "Supersized meal, downsized conscience. Bravo, damn it.",
      "Fast food eaten. In an hour the hunger's back, faster than the shame.",
    ],
  },
  sweets: {
    nag: [
      "Confirm no sweets today, because I can see your paw sneaking into the drawer, damn it.",
      "Sugar is a legal drug and you're in withdrawal. Tick that today's clean.",
      "Just one chocolate? Bullshit. Confirm: none today.",
    ],
    praise: ["A day without sugar. Your pancreas is popping (sugar-free) champagne."],
    slip: [
      "Sweets again. Your teeth and your hips just filed a joint complaint.",
      "Sugar binge done. Crash and whining in an hour, I know the drill.",
    ],
  },
  alcohol: {
    nag: [
      "Confirm no booze today. “Just one beer” is the most common lie in the world, damn it.",
      "Your liver is praying. Tick that you're sober today.",
      "No confirmation means I assume the beer's already fizzing. Tick it if not.",
    ],
    praise: ["A sober day. Tomorrow you wake up without a hangover or the shame. Novel, huh?"],
    slip: [
      "Booze again. Hangover tomorrow, “never again” the day after. I know this act.",
      "Drinking done. Your liver just put you on its blacklist.",
    ],
  },
  smoking: {
    nag: [
      "Confirm no cigarettes today. Your lungs already look like the inside of a chimney, damn it.",
      "Every cigarette is a few minutes of life in the ashtray. Tick that today's clean.",
      "If you smoked today, you stink from a mile away. Confirm you didn't.",
    ],
    praise: ["A smoke-free day. Your lungs are doing cartwheels."],
    slip: [
      "Another cigarette. Your lungs are a smokehouse now, damn it.",
      "You smoked. Bravo, funding the tax office and cancer at the same time.",
    ],
  },
  games: {
    nag: [
      "Confirm no gaming till dawn. “One more round” is your curse, damn it.",
      "The controller has fused to your hands. Tick that you're skipping it today.",
    ],
    praise: ["A day without games. Your real-life character got some XP today."],
    slip: [
      "Gaming till you drop again. Level 80 in the game, still in the tutorial in life.",
      "Gaming beat life. Again. Damn it.",
    ],
  },
  social: {
    nag: [
      "Confirm no mindless scrolling today. Your brain is already reel mush, damn it.",
      "The algorithm feeds you shit and you ask for seconds. Tick that you're skipping it.",
    ],
    praise: ["A day without reels. Your attention span grew to a whole three minutes. Record."],
    slip: [
      "Reels again. Three hours of life for cat videos and people falling over.",
      "Scrolling won. Your brain just got one percent smoother.",
    ],
  },
  avoidGeneric: {
    nag: [
      "“{name}” unconfirmed. I know you. I'm assuming the worst, damn it.",
      "Tick that you skipped “{name}” today, or I'm logging a slip, no discussion.",
      "“{name}” - clean, or screwing up again? Confirm, for fuck's sake.",
    ],
    praise: ["“{name}” clean today. Don't get used to praise, but respect."],
    slip: [
      "“{name}” - again. Willpower level: soggy cardboard.",
      "“{name}” beat you. Again. For fuck's sake.",
    ],
  },
};

/** Extra escalation lines - same keys as MORE_RAGE. */
export const MORE_RAGE_EN: Partial<Record<Category, string[]>> = {
  teeth: [
    "Fuck, teeth still dirty. Mushrooms will start growing in your mouth any minute.",
    "This isn't a reminder anymore, it's an intervention. Bathroom. Toothbrush. NOW, damn it.",
  ],
  water: [
    "{done} of {target} at this hour? Holy shit, even a cactus would pity you.",
    "For fuck's sake, drink the water before you dry out and blow away.",
  ],
  steps: [
    "{done} steps at this hour isn't a result, it's a diagnosis. Get up and walk, damn it.",
    "{left} to go and you're still glued to the couch. Like fungus on a tree, for fuck's sake.",
  ],
  reading: [
    "A whole day without a single page. Your brain just switched to power-saving mode, damn it.",
    "Open the fucking book. One page. I'm begging you, for the good of humanity.",
  ],
  gym: [
    "Workout skipped since morning. Your muscles are quitting and the fat just signed a permanent contract.",
    "Are you moving your ass today or do I call a crane? Go train, damn it!",
  ],
  meditation: [
    "Instead of meditation you've got rage and chaos today. Five minutes, for fuck's sake, five minutes!",
  ],
  sleep: ["Fuck, just go to sleep. Tomorrow you'll be a zombie and I'll get the blame again."],
  pills: [
    "The pill's still in the packet. Think it works if you stare at it? Swallow it, damn it.",
  ],
  learning: [
    "Studying ignored all day. Tomorrow you'll be just as lost as today. Sit down, damn it.",
  ],
  generic: [
    "“{name}” has been waiting since morning. I'm out of energy and you've got less than a dead hamster. Do it, damn it.",
    "Once more: “{name}”. Not tomorrow. Not in an hour. Now, for fuck's sake.",
    "Reminding you about “{name}” for the umpteenth time. Next time I'm switching to CAPS LOCK.",
  ],
  phone: [
    "Still zero confirmation on the phone. I'm assuming you're nose-deep in the screen like a fucking zombie.",
  ],
  fastfood: ["A whole day unconfirmed. I can smell the fries through the screen, damn it."],
  sweets: ["No confirmation on sweets. I'm assuming the whole bag is gone, holy shit."],
  alcohol: ["Still nothing on alcohol. I'm assuming the booze is flowing freely, damn it."],
  smoking: [
    "No confirmation on cigarettes. I'm assuming you're smoking like a dragon with a cold.",
  ],
  games: ["Still nothing on gaming. I'm assuming the controller has fused to your hands for good."],
  social: [
    "Zero confirmation on reels. I'm assuming your thumb has scrolled through half the internet.",
  ],
  avoidGeneric: [
    "“{name}” unconfirmed all day. I'm assuming you went off the rails. Prove me wrong, damn it.",
  ],
};

/** Vulgar but motivating lines added to every habit (hard level) - mirrors MOTIVATE. */
export const MOTIVATE_EN = {
  build: [
    "“{name}” takes a moment and the satisfaction lasts all day. Move your ass, you've got this.",
    "Nobody's coming to do “{name}” for you. But you can, damn it. Now.",
    "Tomorrow-you will thank you for “{name}”. Today-you needs to stop bullshitting and start.",
    "Small steps, damn it. Do just a bit of “{name}”, the rest will follow.",
    "Motivation shows up during, not before. Start “{name}” and you'll get going.",
    "You've got more in you than you show. Prove it with “{name}”, for fuck's sake.",
    "The lazy voice in you says “no”. Tell it to fuck off and do “{name}”.",
    "Streaks don't build themselves. “{name}” today, smug face tomorrow.",
    "Ten minutes. That's how long you scroll one stupid thing. Give those minutes to “{name}”, damn it.",
    "It doesn't have to be perfect. It has to be done. “{name}”, go.",
    "Your stalling pisses me off, but I know you can do it. “{name}”, now.",
    "Do “{name}” out of pure spite for me. Works every time.",
    "The first move is the hardest. Get up, damn it, and take the first step on “{name}”.",
    "One day without “{name}” is an excuse. Two is a lazy habit. Don't let it happen, for fuck's sake.",
  ],
  avoid: [
    "Every clean day is a brick in the wall of willpower. Confirm “{name}” and lay another one, damn it.",
    "Saying no to yourself is strength too. Tick that “{name}” is under control today.",
    "Temptation is screaming, but the decision is yours. Confirm you're clean of “{name}” today.",
    "The habit doesn't run you, damn it. Confirm you skipped “{name}” today.",
    "Holding out one day isn't much. But that's exactly what change is made of. Tick “{name}”.",
    "Willpower is a muscle. Today's workout is “{name}” - confirm you held out.",
  ],
  praise: [
    "Done. See? All you had to do was stop bullshitting and start.",
    "Well damn, beautiful. A few more days like this and you won't recognize yourself in the mirror.",
    "Bravo. The lazy voice in you just got a kick in the ass.",
    "That's how you build strength, character and a streak. Keep it up, damn it.",
    "Done. Feel proud? You should. I'm pretending I don't.",
    "One point for you, zero for excuses. Keep it going, damn it.",
  ],
  rage: [
    "Enough. You get up and do “{name}”. No discussion, no “in a minute”, damn it.",
    "You're capable of more than this pathetic stalling. Show it now with “{name}”.",
    "Final warning: either “{name}” or an evening of guilt. Simple choice.",
    "How long do I have to keep talking? “{name}”. Now. You can hate me later.",
  ],
};
