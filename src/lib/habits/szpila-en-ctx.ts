// English mirror of szpila-ctx.ts - same keys, same number of lines per array,
// same placeholders. Not literal translations.
// Style rules: punchy roast-comedy English, gender-neutral about the user,
// swearing aimed at the behaviour (never at identity), no threats, nothing
// sexually explicit, "meals" always pushes the user to eat. Soft level stays
// polite (no swearing). Line i uses the same placeholders as Polish line i;
// avoid-habit categories never use {done}/{left}/{target}.
import type { Category } from "./szpila";
import type { CtxLines } from "./szpila-ctx";

export const CTX_HARD_EN: Partial<Record<Category, CtxLines>> = {
  teeth: {
    zero: [
      "Teeth: {done} of {target}, and it's already afternoon. The morning brush went to shit, damn it.",
      "Afternoon, and your teeth haven't seen a brush since yesterday. The people on the bus already know why.",
      "Zero brushing so far. The bacteria have had breakfast, lunch and a little afternoon snack.",
      "Half a day with an unwashed mouth. For fuck's sake, toothbrush, right now.",
    ],
    almost: [
      "{left} more brushing and you're done. Evening scrub, two damn minutes, and peace.",
      "Morning's done, evening's left: {left}. Don't fuck it up on the home stretch.",
      "Almost. {left} more with the toothbrush and your teeth can clock out for the day.",
    ],
    late: [
      "Evening, and the night brush is still waiting. Don't go to bed with that crap in your mouth, damn it.",
      "The day's ending. You brush BEFORE bed, not while thinking about bed.",
      "Bed in a minute and the teeth are filthy. The bacteria are already planning an all-night party.",
      "{left} brushing left tonight. Brush, paste, two minutes. Even a tired brain can manage that.",
      "Skip it now and the cavities work triple shifts all night. Bathroom, for fuck's sake.",
    ],
    morning: [
      "Morning, dragon breath. Brush before you knock someone out with a single “hi”.",
      "The coffee can wait. Teeth first, damn it, it's two minutes.",
      "Starting the day without brushing means a mouth like a dumpster. Toothbrush.",
      "First thing today: teeth. Then the phone. Not the other way round.",
      "The morning toothbrush is waiting. Two minutes and you can open your mouth around people again.",
    ],
  },
  water: {
    zero: [
      "{done} of {target} glasses, and it's already afternoon. For fuck's sake, the houseplant got more than you.",
      "Afternoon and not one glass of water. Your brain is shrinking like a raisin as we speak.",
      "Zero water so far. That headache on its way is no coincidence, damn it.",
      "Half a day bone dry. Glass, tap, sip. Now.",
      "It's past two and your water count is {done}. How are you even still blinking?",
    ],
    almost: [
      "Only {left} left. One damn mug and you're done.",
      "{done} of {target} down. Home stretch, don't go soft now.",
      "{left} more and hydration is done. You don't even have to get up, the bottle's right there.",
      "Water almost done. {left} more and your kidneys will send you a thank-you card.",
    ],
    late: [
      "Evening, and water is at {done} of {target}. Drink now, just not all at once, or you'll be sprinting to the toilet all night.",
      "The day's ending and {left} to go. Two glasses before dinner and it's done, damn it.",
      "Catching up on water in the evening like overdue homework. Drink, for fuck's sake.",
      "{left} to go before bed. One glass now, one after dinner.",
    ],
    morning: [
      "First glass of water before the coffee. After a night's sleep you're dry as a cracker.",
      "Good morning. Glass of water to start, before you begin pretending to be a functional human.",
      "Water first, the rest of the world later. One damn sip won't kill you.",
      "Morning hydration is the easiest point of the day. Take it.",
      "Before you unlock your phone, drink a glass of water. That's the deal.",
    ],
  },
  steps: {
    zero: [
      "Steps: {done} of {target}, and it's already afternoon. Your tracker thinks it's lying in a drawer.",
      "Afternoon and still zero steps. For fuck's sake, don't you even walk to the fridge?",
      "Half a day on your ass. Get up and do at least one lap around the block, damn it.",
      "The step counter says {done}. That's not a score, that's the calm before a storm of shame.",
    ],
    almost: [
      "Only {left} short. A quick walk with the neighbour's dog and you're there.",
      "{done} of {target}. Fifteen minutes of walking and you're done, damn it, don't quit now.",
      "{left} to go. Walk to the shop for something, and not the closest one.",
      "Almost! {left} short. Pace the flat, take the stairs, anything.",
    ],
    late: [
      "Evening, and you're {left} short. Walk after dinner, before the couch swallows you whole.",
      "The day's ending and the steps aren't there. Shoes, jacket, twenty minutes, for fuck's sake.",
      "An evening walk is the best sleeping pill there is. It also covers the {left} you're missing.",
      "{left} to the goal and it's dark outside. Streetlights exist, damn it, go.",
    ],
    morning: [
      "Morning. Walk to work, to the bus stop, or at least to the bakery. The steps add up on their own.",
      "Good morning, your tracker is waiting for the first steps. Don't bore it to death.",
      "A few thousand steps in the morning is half the day's battle won. Move.",
      "A morning walk wakes you up better than coffee. Try it, damn it, just once in your life.",
    ],
  },
  reading: {
    zero: [
      "Reading: {done} of {target} min, and it's already afternoon. The book is growing cobwebs.",
      "Half a day without a single page. But how many reels was it, huh?",
      "Zero reading so far. A coffee break is exactly five pages long, damn it.",
    ],
    almost: [
      "Only {left} of reading left. One chapter and it's done.",
      "{done} of {target} min read. Finish it, the characters are frozen mid-scene.",
      "{left} to go. That's the length of one comment-section fight. Pick the book.",
    ],
    late: [
      "Evening is prime book time. Phone down, lamp on, read. Damn, it's that simple.",
      "{left} of reading left before bed. You'll fall asleep faster than with TikTok.",
      "The day's ending and the book hasn't been touched. Ten pages in bed instead of scrolling.",
      "Bed, book, zero screens. That's the evening I'm ordering, for fuck's sake.",
    ],
    morning: [
      "A few pages with your morning coffee beat the internet news as a start.",
      "Morning. Book next to the mug, five minutes of reading, and the day's already smarter.",
      "Before you open your email, open a book. Just for a bit.",
    ],
  },
  coding: {
    zero: [
      "Coding: {done} of {target} min, and it's already afternoon. The editor is still asleep, and so are you.",
      "Half a day, zero code. Commit of the day: “nothing”. Fuck.",
      "Afternoon and not a single line. Even “hello world” is offended.",
      "Zero code so far. Open the laptop before you invent another excuse.",
    ],
    almost: [
      "Only {left} of coding left. Finish that function and commit.",
      "{done} of {target} min written. One test, one fix and you're done, damn it.",
      "{left} to go. Don't leave the branch half-done, tomorrow you won't understand a thing.",
      "Almost. {left} more coding and push. Come on.",
    ],
    late: [
      "Evening, and the code still isn't written. Thirty minutes before bed, editor, music. Go, damn it.",
      "The day's ending. {left} of coding left. Even a tiny fix counts.",
      "Evening coding is a classic. Just wrap it up before midnight, not at three in the morning.",
      "{left} of coding to go. Kill the series, open the IDE, for fuck's sake.",
    ],
    morning: [
      "Your brain is fresh in the morning. Perfect time for the hard part of the code.",
      "Good morning. Coffee, editor, half an hour of code before the world starts calling.",
      "A morning commit tastes better than morning coffee. Well, almost.",
      "Start the day with code, not email. The email can wait, damn it.",
    ],
  },
  language: {
    zero: [
      "Language practice: {done} of {target} min, and it's already afternoon. The Duolingo owl is sharpening its claws.",
      "Half a day without a single word. Your streak is shaking with fear, damn it.",
      "Zero practice so far. An app lesson is five minutes in the checkout queue.",
      "Afternoon, and your head still only speaks one language. Flashcards, for fuck's sake.",
    ],
    almost: [
      "Only {left} of practice left. One lesson and the streak lives.",
      "{done} of {target} min done. Quick vocab review and you're there.",
      "{left} to go. Even the owl would pat you on the back right now. Well, almost.",
    ],
    late: [
      "Evening, and you blew off your language practice. The streak dies at midnight and your pride goes with it. Study, damn it.",
      "The day's ending. {left} of practice left. Flashcards in bed instead of the phone.",
      "Last chance for today's lesson. The Duolingo owl is checking its watch.",
      "{left} to go before bed. Words learned right before sleep stick best, seriously.",
    ],
    morning: [
      "Your brain soaks things up like a sponge in the morning. Five new words with your coffee.",
      "Bonjour, buenos dias, whatever. A warm-up lesson, damn it.",
      "Start the day with an app lesson, not with scrolling. The streak will thank you.",
      "Morning is a good time to review yesterday's words before they escape.",
    ],
  },
  gym: {
    zero: [
      "Afternoon and zero movement. Your body is asking if you still remember it exists.",
      "Half a day without a workout. Ten minutes after work, damn it, no excuses.",
    ],
    almost: [
      "{left} of the workout left. Last set and you're done.",
      "Almost. {left} to go, push through, damn it.",
    ],
    late: [
      "Evening, and the workout is still waiting. Short, but done, for fuck's sake.",
      "The day's ending. Stretching before bed counts too.",
    ],
    morning: [
      "Work out in the morning and the whole day is already handled.",
      "A few exercises in the morning wake you up better than coffee.",
    ],
  },
  meditation: {
    zero: [
      "Afternoon, and not one minute of quiet. Your head's about to explode, damn it. Sit down for a moment.",
    ],
    almost: ["Only {left} of calm left. Hang in there, almost over."],
    late: [
      "Evening is the perfect time for a few breaths before bed. Do it, damn it.",
      "The day's ending. Five minutes of quiet and you'll sleep like a baby.",
    ],
    morning: [
      "Five minutes of breathing in the morning and the day starts without you being pissed off.",
    ],
  },
  sleep: {
    late: [
      "Evening. Start winding down, or you'll end up awake at two again, damn it.",
      "The day's ending. Dim the screen, dim the lights, get to bed.",
    ],
    morning: ["Well rested? If not, you're going to bed earlier tonight. I'm writing it down."],
  },
  pills: {
    zero: ["Afternoon, and “{name}” is still in the packet. One gulp, damn it, two seconds."],
    late: ["Evening, and “{name}” still not taken. Now, before you forget until tomorrow."],
    morning: ["Morning, with breakfast: “{name}”. Easiest thing you'll do all day."],
  },
  learning: {
    zero: ["Afternoon and zero studying. Fifteen minutes, damn it, just fifteen."],
    almost: ["Only {left} of studying left. Finish it while you still remember what it was about."],
    late: [
      "Evening, and the studying is still waiting. Fifteen minutes before bed and it's ticked off, for fuck's sake.",
    ],
    morning: ["Your head is fresh in the morning. Best moment to study."],
  },
  generic: {
    zero: [
      "Afternoon, and “{name}” is still at zero. What the fuck are you doing with this day?",
      "Half the day's gone, “{name}”: {done} of {target}. Fuck me.",
      "It's already afternoon. “{name}” hasn't even started. Start with one small step.",
      "Zero on “{name}” and the clock is ticking. Move it, damn it.",
      "Half the day is behind you and “{name}” hasn't been touched. The second half is your last chance.",
    ],
    almost: [
      "“{name}”: only {left} left. Finish the damn thing.",
      "Already {done} of {target} on “{name}”. Home stretch, don't go soft.",
      "{left} more and “{name}” is ticked off. It'd be a shame to fuck it up now.",
      "Almost! “{name}” is only waiting on {left}.",
      "So close on “{name}”. {left} more and you get bragging rights.",
    ],
    late: [
      "The day's ending, and “{name}” is still not done. Last call, damn it.",
      "Evening. “{name}”, or a guilty conscience on your pillow. Pick one.",
      "A few hours left and “{name}” is waiting. Now, or tomorrow with shame.",
      "Excuses are loudest in the evening. Drown them out and do “{name}”, for fuck's sake.",
      "Not long till midnight and “{name}” isn't ticked off. Shit, always at the last minute.",
      "{left} still to go on “{name}”, and the day's ending. Come on, final round.",
    ],
    morning: [
      "Good morning. “{name}” first and the rest of the day is easy.",
      "Mornings are easiest. Do “{name}” before the day eats you alive.",
      "Morning, coffee and “{name}”. In that order or the other way round, just get it done, damn it.",
      "New day, clean slate. Start with “{name}”.",
      "Before you start scrolling, do “{name}”. That's the morning deal.",
    ],
  },
  phone: {
    late: [
      "Evening. Charger goes to the kitchen, phone goes with it. Bed without a screen, damn it.",
      "Bedtime soon. Keep the phone out of bed tonight and tomorrow you get to tick it clean, with pride.",
      "Night's coming, and with it the urge to scroll under the covers. Put the phone away now.",
      "Evening is when the phone wins easiest. Set the alarm and put it face down, for fuck's sake.",
    ],
    morning: [
      "Good morning. How was your night with the phone? Mark it before you forget, damn it.",
      "Mornings reveal whether there was scrolling at night. Your eyes don't lie. Confirm the night.",
      "New day. Tonight the phone sleeps somewhere else. Write that down.",
    ],
  },
  fastfood: {
    late: [
      "Evening is fast-food o'clock. The delivery app is calling. Don't tap it, damn it.",
      "The day's almost clean. Don't fuck it up with a kebab at 10 p.m.",
      "Evening hunger? Sandwich, scrambled eggs, anything from the fridge. Just not from a drive-thru window.",
      "Almost a whole day without a burger. Mark it clean before you get hungry.",
    ],
    morning: [
      "New day. No fast food today, and lunch comes on a plate, not in a cardboard box.",
      "Easy to promise “no burger today” in the morning. Stick to it till the evening, damn it.",
      "Plan today's lunch so it doesn't end up in the drive-thru. Simple.",
    ],
  },
  porn: {
    late: [
      "Evening and night are the hardest hours. Phone out of the bedroom, damn it, and it gets easier.",
      "The day's almost clean. Don't fuck it up at midnight in incognito mode.",
      "Evenings bring boredom and tiredness. Shower, book, sleep. Just not the browser.",
      "The day's nearly over. Mark it clean and go to sleep like a functioning adult.",
    ],
    morning: [
      "New day, new shot at a clean streak. Don't waste it.",
      "Your head is clearest in the morning. Remember that feeling for tonight.",
      "Good morning. Today you beat the habit. Plan your evening before it plans you.",
    ],
  },
  shopping: {
    late: [
      "Evening is boredom-shopping time. Close the shopping apps, damn it.",
      "A no-spend day is almost in the bag. Don't fuck it up with a cart at 11 p.m.",
      "Sales scream loudest in the evening. Don't listen. Mark that your wallet survived.",
    ],
    morning: [
      "New day. The card stays in the wallet and the cart stays empty.",
      "Easy to say “I'm buying nothing today” in the morning. Tonight I'll remind you of those words.",
      "Good morning. Before you buy anything, wait a full day. Rule of the day.",
    ],
  },
  pervert: {
    late: [
      "Evening. Close the day with some class and mark it clean, damn it.",
      "The day's ending. No late-night messages to people who don't reply.",
      "Night's coming, and night is not an invitation to act like a creep. Mark it clean.",
    ],
    morning: [
      "New day. Eyes at eye level, hands to yourself. That's it.",
      "Morning reminder: respect people all day long. I'll check tonight.",
      "Good morning. Today you think with your head, not your hormones.",
    ],
  },
  meals: {
    late: [
      "Evening. If you skipped a meal today, eat a proper dinner now, damn it.",
      "The day's ending. Dinner isn't optional, it's mandatory. Eat something warm.",
      "Skip lunch and the evening starvation hits like a truck. Eat properly before the fridge loses the fight.",
      "Almost the end of the day. Eat dinner and mark today as no skipped meals.",
    ],
    morning: [
      "Good morning. Breakfast, not just coffee. Damn it, at least a sandwich.",
      "Your body is running on fumes in the morning. Refuel: breakfast.",
      "Eat something before you leave the house. A hungry morning means a pissed-off afternoon.",
      "The first meal of the day is waiting. Egg, oatmeal, yogurt. Take your pick.",
    ],
  },
  avoidGeneric: {
    late: [
      "Evening. “{name}” - the day's almost clean. Don't fuck it up on the home stretch.",
      "The day's ending. Mark “{name}” before you forget, damn it.",
      "Night's coming. If “{name}” stayed clean, tap it. If not, own up.",
      "The last hours of the day are the hardest part of “{name}”. Hold on.",
      "Temptation grows in the evening. “{name}” doesn't win today, for fuck's sake.",
    ],
    morning: [
      "New day, clean slate on “{name}”. Don't waste it before lunch.",
      "Promises are easy in the morning. Today the “{name}” promise has to last till the evening.",
      "Good morning. No “{name}” today, and tonight you'll get to mark that you made it.",
      "Morning. Plan the day so “{name}” doesn't stand a chance.",
      "Morning reminder: “{name}” is not your thing today, damn it.",
    ],
  },
};

export const CTX_SOFT_EN: Partial<Record<Category, CtxLines>> = {
  teeth: {
    late: ["Brush your teeth tonight and you can sleep easy."],
    morning: ["Good morning! A morning brush for a fresh start."],
  },
  water: {
    zero: ["Afternoon - a good moment for your first glass of water."],
    almost: ["Only {left} left. Almost there!"],
    morning: ["A glass of water to start the day is a great habit."],
  },
  steps: {
    almost: ["Only {left} to go. A short walk and you're done!"],
    late: ["An evening walk will help you reach your goal."],
  },
  reading: { late: ["Evening is a lovely time for a few pages."] },
  coding: { almost: ["Only {left} of coding left. Almost!"] },
  language: { late: ["A short lesson before bed keeps your streak alive."] },
  meals: {
    morning: ["Good morning! Time for breakfast."],
    late: ["Time for a nice, relaxed dinner."],
  },
  generic: {
    zero: [
      "Afternoon - a good moment to start “{name}”.",
      "“{name}” is still waiting. Even a small step counts.",
    ],
    almost: ["“{name}”: only {left} left. Almost!", "You're close to your goal on “{name}”."],
    late: [
      "The day's ending - there's still time for “{name}”.",
      "Evening is a good moment for “{name}”.",
    ],
    morning: [
      "Good morning! Why not start with “{name}”?",
      "Morning is a great time for “{name}”.",
    ],
  },
  avoidGeneric: {
    late: [
      "Evening - remember to confirm “{name}”.",
      "Almost the end of the day. You're doing great!",
    ],
    morning: ["New day, new chance with “{name}”.", "Good morning! You can do it today too."],
  },
};
