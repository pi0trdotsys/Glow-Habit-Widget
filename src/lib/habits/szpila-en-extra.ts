// English lines for the extra categories (mirrors szpila-extra.ts: same keys,
// same placeholders). Chosen at call time in szpila.ts.
import type { ExtraCategory } from "./szpila-extra";

interface Lines {
  nag: string[];
  praise: string[];
  slip?: string[];
}

export const EXTRA_HARD_EN: Record<ExtraCategory, Lines & { rage: string[] }> = {
  pervert: {
    nag: [
      "Confirm no pervy stuff today. Eyes up, hands to yourself, thoughts in order, damn it.",
      "Tick that you didn't ogle anyone today like a starving dog staring at a sausage.",
      "No confirmation means your imagination wandered off into the bushes again. Tick it if not.",
      "Respecting people isn't optional. Confirm you behaved like a decent human today, for fuck's sake.",
      "Your brain isn't a search engine for perversions. Confirm your thoughts stayed in check.",
    ],
    praise: [
      "A day without being a perv. Even I, a cat, am surprised.",
      "Clean. Thinking with your head today, not with something else.",
    ],
    slip: [
      "Pervy again. Cold shower, and get a grip, damn it.",
      "Slip. Eyes and thoughts went where they shouldn't again. Better tomorrow.",
    ],
    rage: [
      "A whole day unconfirmed on the perv front. I'm assuming your imagination is running at full throttle, damn it.",
    ],
  },
  coding: {
    nag: [
      "Code doesn't write itself, and AI won't do all your work for you. Fire up the editor, damn it.",
      "“{name}” is waiting. Your git log is emptier than a student's fridge.",
      "{left} to go. Even hello world beats the nothing you're shipping today.",
      "Your repo is gathering dust faster than an old Nokia in a drawer. Commit, for fuck's sake.",
      "Stack Overflow can't help if you won't even open the IDE. Get your ass to the code.",
      "A programmer without code is just a person with an expensive keyboard. Write.",
      "Tutorials watched, code unwritten. Classic, damn it. Open the editor.",
    ],
    praise: [
      "Code written. It might even compile, who the fuck knows.",
      "Coding done. Commit of the day: “stopped slacking off”.",
      "Done. The bugs are trembling. Well, one of them.",
    ],
    rage: [
      "A whole day without a single line of code. Your GitHub looks like a graveyard, damn it.",
      "Open the fucking editor. One function. One commit. Now.",
    ],
  },
  language: {
    nag: [
      "“{name}” is waiting. Your language skills are still at “where is toilet, please”, damn it.",
      "The Duolingo owl is sharpening its beak. Study before it swoops in.",
      "{left} to go. Vocab won't seep into your head, even if you sleep on the dictionary.",
      "Going abroad to point and mime again? Study, for fuck's sake.",
      "Watching a series with subtitles isn't learning a language, genius. Sit down with the vocab.",
      "Ten minutes a day. Even a parrot could manage that, and you can't?",
    ],
    praise: [
      "Language practice done. Muy bien, or however the hell they say it.",
      "Done. Soon you'll order a coffee without pointing.",
    ],
    rage: [
      "A whole day without language practice. The Duolingo owl is on its way with a baseball bat.",
      "Not even five words? Nothing? Holy shit, no hablo lazy.",
    ],
  },
  porn: {
    nag: [
      "Confirm no porn today. Without it I'll assume incognito mode is working overtime again, damn it.",
      "Tick that today's porn-free. Your brain deserves better than dopamine fast food.",
      "No confirmation means your browser history needs wiping again. Tick it if not.",
      "Five minutes of pleasure, then an hour of brain fog. Confirm you're skipping porn today, damn it.",
      "Bored? Go for a walk, call someone, clean your room. Anything but porn. Tick that you're clean.",
      "Every porn-free day is a brain repairing itself. Don't fuck it up today.",
    ],
    praise: [
      "A porn-free day. Your dopamine is recovering and you're getting some dignity back.",
      "Clean. Incognito mode is unemployed today.",
      "Another day without porn. Clearer head, and you're a bit more in control of yourself.",
    ],
    slip: [
      "Porn again. Brain washed down to zero, damn it.",
      "Porn slip. Close the tab, get some fresh air, and start over tomorrow.",
      "Incognito tab again. Holy shit, it was going so well. Tomorrow the count starts from zero.",
    ],
    rage: [
      "A whole day unconfirmed on porn. I'm assuming the worst, for fuck's sake.",
      "Still silence on porn. Either you confirm or I log a slip, damn it. Your call.",
    ],
  },
  meals: {
    nag: [
      "Confirm you ate at normal times today. Coffee for breakfast, lunch and dinner isn't a diet, damn it.",
      "Tick that you didn't skip meals today. Your body isn't a camel.",
      "No confirmation means I assume you're living on coffee and a bag of chips at 11 p.m. again.",
    ],
    praise: [
      "Meals at human hours. Your stomach is shocked, but happy.",
      "A day without starving yourself. Even your mood seems better.",
    ],
    slip: [
      "Skipped a meal again. Then comes the wolf hunger and inhaling everything in the fridge, I know it.",
      "Meal slip. Your body isn't a cactus, it needs feeding, damn it.",
    ],
    rage: [
      "Still no confirmation on meals. I'm assuming you're living on air and caffeine, damn it.",
    ],
  },
  energy: {
    nag: [
      "Confirm no energy drinks today. Your heart's already pounding like a wedding drummer, damn it.",
      "Tick that you skipped the can of taurine crap today.",
    ],
    praise: ["A day without energy drinks. Your heart says thanks, your teeth too."],
    slip: ["Energy drink again. In an hour you'll crash like a sack of bricks."],
    rage: ["No confirmation on energy drinks. I'm assuming the third can is already fizzing."],
  },
  shopping: {
    nag: [
      "Confirm no impulse buys today. An online shopping cart is not therapy, damn it.",
      "Tick that your wallet survived the day. Another parcel from across the world won't change your life.",
      "Do you need it, or are you just bored? Confirm no spending on useless crap today.",
      "Another gadget that'll end up in a drawer next week? Tick that the card stayed in your wallet, damn it.",
      "A sale isn't saving if you don't need it. Confirm you bought nothing stupid today.",
      "Your bank account is crying while the cart is smiling. Tick that today had no impulse buys.",
    ],
    praise: [
      "A day without shopping. Your bank account breathed a sigh of relief.",
      "Zero impulse buys. The money stayed for something that actually makes sense.",
      "Wallet shut all day. Even I'm impressed, damn it.",
    ],
    slip: [
      "Shopping again. The courier knows you better than your family does.",
      "Bought. In a week you won't even remember why.",
      "More useless crap in the cart. In a month it'll be resold for half the price.",
      "Impulse buy. Bravo, you just traded money for five minutes of dopamine.",
    ],
    rage: [
      "No confirmation on shopping. I'm assuming your card is already overheating, damn it.",
      "A whole day unconfirmed on spending. I'm assuming the courier is already on the way with more crap.",
    ],
  },
  gambling: {
    nag: [
      "Confirm no gambling today. The house always wins, and you always pay, damn it.",
      "Tick that you placed no bets today. “Sure thing” is the most expensive phrase in the world.",
    ],
    praise: ["A day without gambling. Your money stayed with you. Revolutionary."],
    slip: ["Gambling again. The bookie just bought new rims with your cash."],
    rage: ["No confirmation on gambling. I'm assuming you're already betting, holy shit."],
  },
  binge: {
    nag: [
      "Confirm no series marathon today. “Just one more episode” is a lie, damn it.",
      "Tick that there's no binge-watching today. Netflix asks if you're still watching. I'm asking if you're still alive.",
    ],
    praise: ["A day without a series marathon. Real life has a better plot."],
    slip: ["A whole season in one go again. The writers are thrilled, your eyes less so."],
    rage: ["No confirmation on series. I'm assuming autoplay has been running for hours."],
  },
  snooze: {
    nag: [
      "Confirm no snoozing today. Five rounds of “five more minutes” is 25 minutes of life down the drain, damn it.",
      "Tick that you got up on the first alarm.",
    ],
    praise: ["Up without snoozing. The alarm clock is in shock."],
    slip: ["Snoozed again. The alarm gave up, and you're still beating it at laziness."],
    rage: ["No confirmation on the alarm. I'm assuming the snooze button set a new record."],
  },
  nails: {
    nag: [
      "Confirm no nail biting today. Your fingers aren't a snack, damn it.",
      "Tick that your nails survived the day.",
    ],
    praise: ["Nails intact. Even a manicurist would be proud."],
    slip: ["Bitten again. Your nails look like they lost a fight with a beaver."],
    rage: ["No confirmation on nails. I'm assuming only stumps are left."],
  },
  caffeine: {
    nag: [
      "Confirm coffee in moderation today. Then you whine that you can't sleep, damn it.",
      "Tick that you had as much caffeine as you needed, not a bucket.",
    ],
    praise: ["Coffee in moderation. Heart beating normally, shocking."],
    slip: ["Coffee after coffee again. Your hands are shaking like a shoplifter's."],
    rage: [
      "No confirmation on coffee. I'm assuming it's running through your veins instead of blood.",
    ],
  },
  procrastination: {
    nag: [
      "Confirm no procrastinating today. “I'll do it later” is your middle name, damn it.",
      "Tick that the work got done on time today, not at 11:59 p.m.",
    ],
    praise: ["A day without putting things off. I don't believe it, but respect."],
    slip: [
      "Everything pushed to tomorrow again. Tomorrow will also be “for tomorrow”, I know you.",
    ],
    rage: ["No confirmation on procrastination. Ironic: you can't even do that on time."],
  },
};

export const EXTRA_SOFT_EN: Record<ExtraCategory, Lines> = {
  pervert: {
    nag: ["Confirm no pervy behavior or thoughts today."],
    praise: ["A day without a slip. Well done!"],
    slip: ["A slip happened. Tomorrow is a new day."],
  },
  coding: {
    nag: [
      "Time for “{name}”. Even 15 minutes of code counts.",
      "{left} of coding to go. You've got this!",
    ],
    praise: ["Code written. Great job!"],
  },
  language: {
    nag: [
      "A few minutes of language practice? Time for “{name}”.",
      "{left} of practice to go. Every word counts.",
    ],
    praise: ["Language practice done. Well done!"],
  },
  porn: {
    nag: ["Confirm no porn today.", "Every clean day counts. Confirm no porn today."],
    praise: ["A day without porn. Well done!"],
    slip: ["A slip happened. Tomorrow is a new day."],
  },
  meals: {
    nag: ["Confirm you ate regular meals today."],
    praise: ["Regular meals. Great!"],
    slip: ["A meal got skipped. Try again tomorrow."],
  },
  energy: {
    nag: ["Confirm no energy drinks today."],
    praise: ["A day without energy drinks. Well done!"],
    slip: ["An energy drink happened. Better tomorrow."],
  },
  shopping: {
    nag: [
      "Confirm no impulse buys today.",
      "Before you buy something: do you really need it? Confirm no unnecessary spending today.",
    ],
    praise: ["A day without shopping. Great!"],
    slip: ["A purchase happened. Better tomorrow."],
  },
  gambling: {
    nag: ["Confirm no gambling today."],
    praise: ["A day without gambling. Well done!"],
    slip: ["Gambling happened. Don't give up."],
  },
  binge: {
    nag: ["Confirm no series marathon today."],
    praise: ["A day without a marathon. Great!"],
    slip: ["A marathon happened. Better tomorrow."],
  },
  snooze: {
    nag: ["Confirm no snoozing the alarm today."],
    praise: ["Up without snoozing. Well done!"],
    slip: ["A snooze happened. Try getting up right away tomorrow."],
  },
  nails: {
    nag: ["Confirm no nail biting today."],
    praise: ["Nails intact. Well done!"],
    slip: ["It happened. Better tomorrow."],
  },
  caffeine: {
    nag: ["Confirm coffee in moderation today."],
    praise: ["Coffee in moderation. Great!"],
    slip: ["Too much coffee. Less tomorrow."],
  },
  procrastination: {
    nag: ["Confirm no putting things off today."],
    praise: ["A day without procrastinating. Well done!"],
    slip: ["Put off for later. Straight to it tomorrow."],
  },
};
