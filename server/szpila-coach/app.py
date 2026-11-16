"""Szpila coach: mate-style comments written by a small local model (Ollama).

The phone sends only facts it already computed and gets back a short comment:
  - "day": the evening recap (percent, done / missed habits, slips),
  - "week": Sunday's comment on the week (vs last week, best / weakest habits),
  - "forecast": the morning "Prognoza na dziś" (risky habits and why, today's plan).
Discreet habits never reach it. Every answer is checked (no numbers, no gendered forms, the tone
has to match the result, the right name, sane length); a sentence that breaks a rule is dropped,
and it retries while the phone still waits; otherwise the app keeps its own text. Standard
library only.
"""

import hmac
import json
import os
import re
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

TOKEN = os.environ["COACH_TOKEN"]
OLLAMA = os.environ.get("OLLAMA_URL", "http://172.17.0.1:11434")
MODEL = os.environ.get("COACH_MODEL", "bielik-4.5b-v3-q4")
PORT = int(os.environ.get("COACH_PORT", "8790"))
MAX_BODY = 8 * 1024

# Start another try only this soon after the first (the phone waits 150 s).
ATTEMPT_BUDGET_S = 85
# One generation at a time (CPU-only box shared with other services).
GEN_LOCK = threading.Lock()
# Failed auth attempts per client, for a simple back-off.
FAILS: dict[str, list[float]] = {}

KINDS = ("day", "week", "forecast")

PERSONA = {
    "pl": (
        "Jesteś Szpilą, złośliwą, ale życzliwą kotką z aplikacji do nawyków. Piszesz jak kumpel, "
        "po polsku. Zasady: nie podawaj żadnych liczb ani cyfr; nie wymyślaj niczego spoza danych; "
        "nie używaj form zależnych od płci (zamiast zrobiłeś/zrobiłaś pisz udało się, masz, "
        "poszło); zwracaj się po imieniu dokładnie tak, jak podano, albo wcale; bez list, "
        "nagłówków, gwiazdek i emotek. Odpowiadasz tylko komentarzem."
    ),
    "en": (
        "You are Szpila, a snarky but kind cat from a habit app. You write like a mate would, in "
        "English. Rules: no numbers or digits at all; nothing beyond the facts; use the name "
        "exactly as given, or none; no lists, headings, asterisks or emoji. Reply with the "
        "comment only."
    ),
}

TASK = {
    ("day", "pl"): (
        "Na podstawie danych o dniu piszesz komentarz: dokładnie 2 krótkie zdania. Ton musi pasować "
        "do oceny dnia: przy ocenie fatalny albo słaby nie chwal (żadnego świetnie, brawo, dobry "
        "wynik), tylko szczerze, z humorem pociśnij i powiedz, od czego zacząć jutro; przy dobrym "
        "albo lepszym pochwal i wskaż, czego zabrakło."
    ),
    ("day", "en"): (
        "From the facts about the day write a comment: exactly 2 short sentences. The tone has to "
        "match the verdict: for awful or weak do not praise (no great, well done, nice result), be "
        "honest, tease with humour and say what to start with tomorrow; for good or better, praise "
        "and point out what was missing."
    ),
    ("week", "pl"): (
        "Jest niedziela wieczór. Na podstawie danych o tygodniu piszesz komentarz: 2 albo 3 krótkie "
        "zdania. Oceń tydzień i porównaj z poprzednim zgodnie z danymi, nazwij to, co szło "
        "najsłabiej, i daj jedną konkretną radę na przyszły tydzień. Ton musi pasować do oceny."
    ),
    ("week", "en"): (
        "It's Sunday evening. From the facts about the week write a comment: 2 or 3 short sentences. "
        "Judge the week and compare it with the one before, as the facts say, name what went "
        "worst and give one concrete tip for next week. The tone has to match the verdict."
    ),
    ("forecast", "pl"): (
        "Jest rano. Piszesz prognozę na dziś: dokładnie 2 krótkie zdania. Powiedz, który nawyk dziś "
        "jest zagrożony i dlaczego (tylko z danych), i daj jedną konkretną radę na dziś. Jeśli "
        "ryzyka nie ma, krótko zmotywuj do planu na dziś."
    ),
    ("forecast", "en"): (
        "It's morning. You write today's forecast: exactly 2 short sentences. Say which habit is at "
        "risk today and why (from the facts only) and give one concrete tip for today. If there's "
        "no risk, briefly push for today's plan."
    ),
}

# Few-shot examples by result (picked nearest to the user's): (pct, facts, answer).
EXAMPLES = {
    ("day", "pl"): [
        (0, "Imię: Ola. Ton: ostry, wolno lekko przeklinać. Ocena dnia: fatalny, nic nie zrobione. "
            "Zrobione: nic. Zabrakło: woda, czytanie, kroki. Wpadki: brak.",
         "Ola, dziś totalne zero, nawet woda została w kranie. Jutro zacznij od jednej szklanki z "
         "samego rana i niech to pociągnie resztę."),
        (50, "Imię: Ola. Ton: łagodny. Ocena dnia: średni, mniej więcej połowa. Zrobione: woda, "
             "medytacja. Zabrakło: czytanie, kroki. Wpadki: brak.",
         "Ola, połowa za tobą, czyli ani tragedia, ani powód do fanfar. Czytanie i kroki jutro "
         "wrzuć przed obiadem, zanim dzień się rozjedzie."),
        (80, "Imię: Ola. Ton: łagodny. Ocena dnia: dobry, większość. Zrobione: woda, czytanie, "
             "medytacja, kroki. Zabrakło: siłownia. Wpadki: brak.",
         "Ola, to był naprawdę mocny dzień, większość odhaczona. Siłownia dziś odpuściła, ale z "
         "takim rozpędem jutro nadrobisz bez problemu."),
    ],
    ("day", "en"): [
        (0, "Name: Ola. Tone: sharp, light swearing allowed. Verdict: awful, nothing done. Done: "
            "nothing. Missed: water, reading, steps. Slips: none.",
         "Ola, a big fat zero today, even the water stayed in the tap. Tomorrow start with one "
         "glass first thing and let it drag the rest along."),
        (50, "Name: Ola. Tone: gentle. Verdict: average, about half. Done: water, meditation. "
             "Missed: reading, steps. Slips: none.",
         "Ola, half of it done, so no disaster and no fanfare either. Put reading and steps "
         "before lunch tomorrow, before the day gets away from you."),
        (80, "Name: Ola. Tone: gentle. Verdict: good, most of it. Done: water, reading, "
             "meditation, steps. Missed: gym. Slips: none.",
         "Ola, that was a really strong day, most of it ticked off. The gym took the day off, but "
         "with that momentum you'll catch up tomorrow, no problem."),
    ],
    ("week", "pl"): [
        (30, "Imię: Ola. Ton: ostry, wolno lekko przeklinać. Ocena tygodnia: słaby, gorzej niż "
             "poprzedni. Najlepiej szło: woda. Najsłabiej: siłownia, czytanie. Wpadki: kilka.",
         "Ola, ten tydzień wyszedł słabiej niż poprzedni, a siłownia z czytaniem praktycznie "
         "leżały. W przyszłym tygodniu umów się z siłownią na dwa konkretne dni i traktuj to jak "
         "spotkanie."),
        (80, "Imię: Ola. Ton: łagodny. Ocena tygodnia: dobry, lepiej niż poprzedni. Najlepiej szło: "
             "woda, kroki. Najsłabiej: czytanie. Wpadki: brak.",
         "Ola, mocny tydzień i lepszy niż poprzedni, woda i kroki szły jak w zegarku. Czytanie "
         "wciąż kuleje, więc w przyszłym tygodniu daj mu dziesięć minut przed snem."),
    ],
    ("week", "en"): [
        (30, "Name: Ola. Tone: sharp, light swearing allowed. Verdict on the week: weak, worse than "
             "the week before. Went best: water. Went worst: gym, reading. Slips: a few.",
         "Ola, this week went worse than the last one, and the gym and reading barely moved. Next "
         "week book the gym for two fixed days and treat them like meetings."),
        (80, "Name: Ola. Tone: gentle. Verdict on the week: good, better than the week before. Went "
             "best: water, steps. Went worst: reading. Slips: none.",
         "Ola, a strong week and better than the last, water and steps ran like clockwork. "
         "Reading still limps, so next week give it ten minutes before bed."),
    ],
    ("forecast", "pl"): [
        (None, "Imię: Ola. Ton: łagodny. Dziś: wtorek. Zagrożone: siłownia (po krótkim śnie), "
               "słodycze (dzień po wpadce). Plan na dziś: woda, siłownia, czytanie.",
         "Ola, po krótkim śnie siłownia będzie dziś kusić, żeby ją odpuścić, a po wczorajszej "
         "wpadce słodycze same będą wołać. Zrób trening przed południem i nie trzymaj słodyczy "
         "pod ręką."),
    ],
    ("forecast", "en"): [
        (None, "Name: Ola. Tone: gentle. Today: Tuesday. At risk: gym (after a short sleep), sweets "
               "(the day after a slip). Today's plan: water, gym, reading.",
         "Ola, after a short sleep the gym will be easy to skip today, and after yesterday's slip "
         "the sweets will be calling. Train before noon and keep the sweets out of reach."),
    ],
}

# Per kind: how many sentences and characters (the comment goes into a notification), tokens.
SHAPE = {"day": (2, 240, 120), "week": (3, 320, 170), "forecast": (2, 260, 130)}

# Polish gendered past forms: "zrobiłeś", "byłaś", "coś ty odpierdolił".
GENDERED = re.compile(r"\w+(łeś|łaś|łbyś|łabyś)\b|\bty\s+\w+ł[a]?\b", re.IGNORECASE)
FORMATTING = re.compile(r"[*#_`>\[\]]|^\s*[-•]", re.MULTILINE)
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")

# Praise on a weak result / gloom on a good one = the model didn't read the facts.
PRAISE = {
    "pl": re.compile(r"świetn|brawo|gratul|rewelac|\bsuper\b|wspaniał|znakomit|doskonał|"
                     r"mocn[yi] (dzień|tydzień)|dobra robota|dumn|perfekc|idealn|niezł|udan|"
                     r"dobry wynik|pięknie|ekstra", re.IGNORECASE),
    "en": re.compile(r"\bgreat\b|awesome|well done|congrat|brilliant|excellent|strong (day|week)|"
                     r"nice (work|job|result)|proud|perfect|amazing|\bsolid\b|fantastic",
                     re.IGNORECASE),
}
GLOOM = {
    "pl": re.compile(r"katastrof|tragedi|fataln|\bzero\b|totaln|leni|lenist|beznadziej|porażk|"
                     r"nic nie (zrobi|odhacz|wysz)|kompletn", re.IGNORECASE),
    "en": re.compile(r"disaster|terrible|awful|\bzero\b|nothing (done|got done)|lazy|hopeless|"
                     r"failure|wasted", re.IGNORECASE),
}
# Habits from the few-shot examples: named in a comment, they must be the user's too.
EXAMPLE_HABITS = {
    "pl": ["wod", "czytan", "krok", "siłown", "medytac", "słodycz", "trening"],
    "en": ["water", "reading", "steps", "gym", "meditat", "sweets", "train"],
}
PRAISE_BELOW = 50
GLOOM_FROM = 75

# Claims about how much got done, by the lowest percent they're true from (overstating = reject).
CLAIMS = {
    "pl": [(60, r"większoś"), (85, r"prawie wszystk|prawie komplet"),
           (100, r"\bkomplet|wszystko (zrobion|odhaczon)|perfekcyjn|idealn")],
    "en": [(60, r"\bmost of\b|\bmostly\b"), (85, r"almost (everything|all)"),
           (100, r"\bperfect\b|everything (done|ticked)|full house")],
}

# A leading "Hej," / "No," is fine; another word before the comma would be a (wrong) name.
OPENERS = {
    "hej", "no", "cóż", "ej", "słuchaj", "stary", "stara", "kurde", "dobra", "ok", "okej", "hmm",
    "wow", "oj", "ech", "ach", "uff", "ale", "hey", "well", "look", "listen", "mate", "oh",
    "right", "okay", "so", "dzisiaj", "dziś", "jutro", "today", "tomorrow", "tak", "nie", "yes",
}


def clean_list(v, limit=12):
    if not isinstance(v, list):
        return []
    out = []
    for x in v[:limit]:
        s = re.sub(r"\s+", " ", str(x)).strip()[:40]
        if s:
            out.append(s)
    return out


def clean_name(f: dict) -> str:
    return re.sub(r"[^\w .'-]", "", str(f.get("name", "")))[:24].strip()


def pct_of(f: dict, key: str = "pct") -> int | None:
    try:
        v = f.get(key)
        return None if v is None else max(0, min(100, int(v)))
    except (TypeError, ValueError):
        return None


def how_much(pct: int, lang: str) -> str:
    """The percent in words, so the model doesn't have to judge numbers."""
    pl = ["nic", "mało", "mniej więcej połowa", "większość", "prawie wszystko", "wszystko"]
    en = ["nothing", "a little", "about half", "most of it", "almost everything", "everything"]
    i = 0 if pct == 0 else 1 if pct < 40 else 2 if pct < 60 else 3 if pct < 85 else 4 if pct < 100 else 5
    return (en if lang == "en" else pl)[i]


def verdict(pct: int, lang: str) -> str:
    pl = ["fatalny", "słaby", "średni", "dobry", "bardzo dobry", "perfekcyjny"]
    en = ["awful", "weak", "average", "good", "very good", "perfect"]
    i = 0 if pct == 0 else 1 if pct < 40 else 2 if pct < 60 else 3 if pct < 85 else 4 if pct < 100 else 5
    return (en if lang == "en" else pl)[i]


def tone(f: dict, lang: str) -> str:
    hard = f.get("level") != "soft"
    if lang == "en":
        return "sharp, light swearing allowed" if hard else "gentle"
    return "ostry, wolno lekko przeklinać" if hard else "łagodny"


def few(n, lang: str) -> str:
    try:
        n = int(n)
    except (TypeError, ValueError):
        n = 0
    if lang == "en":
        return "none" if n <= 0 else "one" if n == 1 else "a few" if n < 5 else "a lot"
    return "brak" if n <= 0 else "jedna" if n == 1 else "kilka" if n < 5 else "sporo"


WEEKDAY = {
    "pl": ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"],
    "en": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
}
WEEKDAYS = {
    "pl": ["w niedziele", "w poniedziałki", "we wtorki", "w środy", "w czwartki", "w piątki", "w soboty"],
    "en": ["on Sundays", "on Mondays", "on Tuesdays", "on Wednesdays", "on Thursdays", "on Fridays",
           "on Saturdays"],
}


def reason_words(r: dict, wd: int, lang: str) -> str:
    key = r.get("reason")
    avoid = r.get("kind") == "avoid"
    if lang == "en":
        return {
            "night": "after a night on the phone past midnight",
            "sleep": "after a short sleep",
            "nightSleep": "after a night on the phone and a short sleep",
            "rescue": "the day after a slip" if avoid else "the day after skipping it",
            "wd": f"it usually goes worse {WEEKDAYS['en'][wd]}",
        }.get(key, "it's been shaky lately")
    return {
        "night": "po nocy z telefonem po północy",
        "sleep": "po krótkim śnie",
        "nightSleep": "po nocy z telefonem i krótkim śnie",
        "rescue": "dzień po wpadce" if avoid else "dzień po odpuszczeniu",
        "wd": f"{WEEKDAYS['pl'][wd]} zwykle idzie gorzej",
    }.get(key, "ostatnio się sypie")


def facts_text(kind: str, f: dict, lang: str) -> str:
    name = clean_name(f)
    en = lang == "en"
    if kind == "week":
        pct, prev = pct_of(f) or 0, pct_of(f, "prev")
        if prev is None:
            cmp = "no week before to compare" if en else "brak poprzedniego do porównania"
        elif pct - prev >= 5:
            cmp = "better than the week before" if en else "lepiej niż poprzedni"
        elif prev - pct >= 5:
            cmp = "worse than the week before" if en else "gorzej niż poprzedni"
        else:
            cmp = "about the same as the week before" if en else "podobnie jak poprzedni"
        best, worst = clean_list(f.get("best"), 3), clean_list(f.get("worst"), 3)
        if en:
            return (f"Name: {name or 'none'}. Tone: {tone(f, lang)}. Verdict on the week: "
                    f"{verdict(pct, lang)}, {cmp}. Went best: {', '.join(best) or 'nothing'}. "
                    f"Went worst: {', '.join(worst) or 'nothing'}. Slips: {few(f.get('slips'), lang)}.")
        return (f"Imię: {name or 'brak'}. Ton: {tone(f, lang)}. Ocena tygodnia: {verdict(pct, lang)}, "
                f"{cmp}. Najlepiej szło: {', '.join(best) or 'nic'}. Najsłabiej: "
                f"{', '.join(worst) or 'nic'}. Wpadki: {few(f.get('slips'), lang)}.")
    if kind == "forecast":
        try:
            wd = int(f.get("wd", 0)) % 7
        except (TypeError, ValueError):
            wd = 0
        risks = []
        for r in (f.get("risks") if isinstance(f.get("risks"), list) else [])[:3]:
            if isinstance(r, dict) and clean_list([r.get("name")]):
                risks.append(f"{clean_list([r.get('name')])[0]} ({reason_words(r, wd, lang)})")
        plan = clean_list(f.get("plan"), 8)
        if en:
            return (f"Name: {name or 'none'}. Tone: {tone(f, lang)}. Today: {WEEKDAY['en'][wd]}. "
                    f"At risk: {', '.join(risks) or 'nothing in particular'}. "
                    f"Today's plan: {', '.join(plan) or 'nothing'}.")
        return (f"Imię: {name or 'brak'}. Ton: {tone(f, lang)}. Dziś: {WEEKDAY['pl'][wd]}. "
                f"Zagrożone: {', '.join(risks) or 'nic szczególnego'}. "
                f"Plan na dziś: {', '.join(plan) or 'nic'}.")
    pct = pct_of(f) or 0
    done, missing, slips = (clean_list(f.get(k)) for k in ("done", "missing", "slips"))
    if en:
        return (f"Name: {name or 'none'}. Tone: {tone(f, lang)}. Verdict: {verdict(pct, lang)}, "
                f"{how_much(pct, lang)} done. Done: {', '.join(done) or 'nothing'}. "
                f"Missed: {', '.join(missing) or 'nothing'}. Slips: {', '.join(slips) or 'none'}.")
    return (f"Imię: {name or 'brak'}. Ton: {tone(f, lang)}. Ocena dnia: {verdict(pct, lang)}, "
            f"zrobione: {how_much(pct, lang)}. Zrobione: {', '.join(done) or 'nic'}. "
            f"Zabrakło: {', '.join(missing) or 'nic'}. Wpadki: {', '.join(slips) or 'brak'}.")


def habit_names(kind: str, f: dict) -> list[str]:
    if kind == "week":
        keys = ("best", "worst")
    elif kind == "forecast":
        risks = f.get("risks") if isinstance(f.get("risks"), list) else []
        return clean_list([r.get("name") for r in risks if isinstance(r, dict)]) + clean_list(f.get("plan"))
    else:
        keys = ("done", "missing", "slips")
    return [n for k in keys for n in clean_list(f.get(k))]


def overstates(text: str, pct: int, lang: str) -> bool:
    return any(pct < low and re.search(rx, text, re.IGNORECASE) for low, rx in CLAIMS[lang])


def bad_sentence(s: str, lang: str, pct: int | None, names: list[str]) -> str | None:
    """Why one sentence breaks a rule (a short code for the log), or None."""
    bare = s
    for n in names:  # a habit called "8000 kroków" may be named as it is
        bare = re.sub(re.escape(n), "", bare, flags=re.IGNORECASE)
    if re.search(r"\d", bare):
        return "digit"
    if lang == "pl" and GENDERED.search(s):
        return "gender"
    mine = " ".join(names).lower()
    low = s.lower()
    if any(stem in low and stem not in mine for stem in EXAMPLE_HABITS[lang]):
        return "invented"
    if pct is not None:
        if overstates(s, pct, lang):
            return "overstates"
        if pct < PRAISE_BELOW and PRAISE[lang].search(s):
            return "praise"
        if pct >= GLOOM_FROM and GLOOM[lang].search(s):
            return "gloom"
    return None


def fix_name(t: str, name: str) -> str:
    """The model's take on the name ("Piter" for "Piotr", the example's "Ola") -> the real one."""
    m = re.match(r"^(\w+)(,\s*)", t)
    if not m or m.group(1).lower() in OPENERS or not m.group(1)[:1].isupper():
        return t
    word = m.group(1)
    if not name:  # no name given: drop the one it made up
        rest = t[m.end():]
        return rest[:1].upper() + rest[1:]
    stem = name[: max(3, len(name) - 1)].lower()  # "Piotrze", "Olu" are fine
    if word.lower().startswith(stem) or word.lower() == name.lower():
        return t
    return re.sub(rf"\b{re.escape(word)}\b", name, t)


def acceptable(text: str, lang: str, pct: int | None = None, names: list[str] | None = None,
               kind: str = "day", name: str = "") -> tuple[str | None, str]:
    """(the comment tidied up, or None; a reason code for the log). A sentence that breaks a
    rule is dropped, not the whole comment - the model slips on one phrase far more often."""
    t = EMOJI.sub("", text).replace("—", "-").replace("–", "-")
    t = FORMATTING.sub("", t).strip().strip('"„”')
    t = re.sub(r"\s+", " ", t)
    t = fix_name(t, name)
    if len(t) < 30:
        return None, "short"
    kept, why = [], []
    for s in re.split(r"(?<=[.!?])\s+", t):
        r = bad_sentence(s, lang, pct, names or [])
        if r:
            why.append(r)
        else:
            kept.append(s)
    out = fit(kept, kind)
    if not out:
        return None, ",".join(why) or "long"
    return out, "ok" if not why else "ok-dropped:" + ",".join(why)


def fit(sentences: list[str], kind: str = "day") -> str | None:
    """At most the kind's sentences and characters, cut between sentences; None if under 40."""
    most, max_chars, _ = SHAPE[kind]
    out = ""
    for s in sentences[:most]:
        nxt = f"{out} {s}".strip()
        if len(nxt) > max_chars:
            break
        out = nxt
    return out if len(out) >= 40 else None


def ollama_chat(messages, temperature: float, tokens: int = 120) -> str:
    body = json.dumps(
        {
            "model": MODEL,
            "stream": False,
            "keep_alive": "5m",
            "options": {
                "num_predict": tokens,
                "temperature": temperature,
                "num_ctx": 1536,
                "num_thread": 8,
            },
            "messages": messages,
        }
    ).encode()
    req = urllib.request.Request(
        f"{OLLAMA}/api/chat", data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=150) as r:
        return json.load(r)["message"]["content"]


def example_for(kind: str, lang: str, pct: int | None):
    """The few-shot example nearest to the user's result (a 0% day gets the 0% one)."""
    ex = EXAMPLES[(kind, lang)]
    if pct is None:
        return ex[0]
    return min(ex, key=lambda e: abs((e[0] or 0) - pct))


def comment(f: dict) -> str | None:
    lang = "en" if f.get("lang") == "en" else "pl"
    kind = f.get("kind") if f.get("kind") in KINDS else "day"
    pct = None if kind == "forecast" else (pct_of(f) or 0)
    _, ex_user, ex_bot = example_for(kind, lang, pct)
    messages = [
        {"role": "system", "content": PERSONA[lang] + " " + TASK[(kind, lang)]},
        {"role": "user", "content": ex_user},
        {"role": "assistant", "content": ex_bot},
        {"role": "user", "content": facts_text(kind, f, lang)},
    ]
    names = habit_names(kind, f)
    tokens = SHAPE[kind][2]
    t0 = time.monotonic()
    with GEN_LOCK:
        # a few tries while the phone still waits (it gives up after 150 s; one try ~15-35 s)
        for i, temperature in enumerate((0.6, 0.5, 0.75, 0.4), 1):
            if i > 1 and time.monotonic() - t0 > ATTEMPT_BUDGET_S:
                break
            raw = ollama_chat(messages, temperature, tokens)
            ok, why = acceptable(raw, lang, pct, names, kind, clean_name(f))
            print(f"{kind} try {i}: {why}", flush=True)  # reason codes only, never the text
            if ok:
                return ok
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "szpila-coach"

    def log_message(self, fmt, *args):  # no request bodies or tokens in logs
        print(f"{self.address_string()} {self.command} {self.path} {args[1] if len(args) > 1 else ''}")

    def client(self) -> str:
        return self.headers.get("CF-Connecting-IP") or self.client_address[0]

    def authorized(self) -> bool:
        ip, now = self.client(), time.time()
        recent = [t for t in FAILS.get(ip, []) if now - t < 600]
        FAILS[ip] = recent
        if len(recent) >= 10:
            return False
        got = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if hmac.compare_digest(got.encode(), TOKEN.encode()):
            return True
        recent.append(now)
        return False

    def send(self, code: int, obj: dict):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path != "/v1/health":
            return self.send(404, {"error": "not found"})
        if not self.authorized():
            return self.send(401, {"error": "unauthorized"})
        self.send(200, {"ok": True, "model": MODEL})

    def do_POST(self):
        if self.path != "/v1/comment":
            return self.send(404, {"error": "not found"})
        if not self.authorized():
            return self.send(401, {"error": "unauthorized"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self.send(413, {"error": "too large"})
        try:
            facts = json.loads(self.rfile.read(n))
            if not isinstance(facts, dict):
                raise ValueError
        except ValueError:
            return self.send(400, {"error": "bad json"})
        t0 = time.time()
        try:
            text = comment(facts)
        except Exception as e:  # Ollama down / timeout: the app keeps its own text
            print(f"generation failed: {type(e).__name__}")
            text = None
        self.send(200, {"text": text, "ms": int((time.time() - t0) * 1000)})


if __name__ == "__main__":
    print(f"szpila-coach on 127.0.0.1:{PORT}, model {MODEL}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
