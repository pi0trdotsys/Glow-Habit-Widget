"""Szpila coach: a mate-style comment on the user's day, written by a small local model (Ollama).

The phone sends only facts it already computed (percent, which habits got done / were missed,
slips - never "discreet" habits) and gets back two sentences. Numbers, lists and advice stay
in the app; the model only adds the human touch. Every answer is checked (no numbers, no
gendered forms, no formatting, sane length) and retried once; otherwise the app keeps its own
text. Standard library only.
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

# One generation at a time (CPU-only box shared with other services).
GEN_LOCK = threading.Lock()
# Failed auth attempts per client, for a simple back-off.
FAILS: dict[str, list[float]] = {}

SYSTEM = {
    "pl": (
        "Jesteś Szpilą, złośliwą, ale życzliwą kotką z aplikacji do nawyków. Na podstawie danych "
        "o dniu piszesz krótki komentarz jak kumpel: dokładnie 2 krótkie zdania, po polsku. Zasady: nie "
        "podawaj żadnych liczb; nie wymyślaj niczego spoza danych; nie używaj form zależnych od "
        "płci (zamiast zrobiłeś/zrobiłaś pisz udało się, masz, poszło); bez list, nagłówków, "
        "gwiazdek i emotek. Odpowiadasz tylko komentarzem."
    ),
    "en": (
        "You are Szpila, a snarky but kind cat from a habit app. From the facts about the day you "
        "write a short comment like a mate would: exactly 2 short sentences, in English. Rules: no "
        "numbers at all; nothing beyond the facts; no lists, headings, asterisks or emoji. Reply "
        "with the comment only."
    ),
}

EXAMPLE = {
    "pl": (
        "Imię: Ola. Ton: łagodny. Dzień: 80%, czyli większość. Zrobione: woda, czytanie, medytacja, kroki. "
        "Zabrakło: siłownia. Wpadki: brak.",
        "Ola, to był naprawdę mocny dzień, większość odhaczona. Siłownia dziś odpuściła, "
        "ale z takim rozpędem jutro nadrobisz bez problemu.",
    ),
    "en": (
        "Name: Ola. Tone: gentle. Day: 80%, that is most of it. Done: water, reading, meditation, steps. "
        "Missed: gym. Slips: none.",
        "Ola, that was a really strong day, most of it ticked off. The gym took the day "
        "off, but with that momentum you'll catch up tomorrow, no problem.",
    ),
}

# Polish gendered past forms: "zrobiłeś", "byłaś", "coś ty odpierdolił".
GENDERED = re.compile(r"\w+(łeś|łaś|łbyś|łabyś)\b|\bty\s+\w+ł[a]?\b", re.IGNORECASE)
FORMATTING = re.compile(r"[*#_`>\[\]]|^\s*[-•]", re.MULTILINE)
EMOJI = re.compile("[\U0001F000-\U0001FAFF☀-➿️]")


def clean_list(v, limit=12):
    if not isinstance(v, list):
        return []
    out = []
    for x in v[:limit]:
        s = re.sub(r"\s+", " ", str(x)).strip()[:40]
        if s:
            out.append(s)
    return out


def how_much(pct: int, lang: str) -> str:
    """The percent in words, so the model doesn't have to judge numbers."""
    pl = ["nic", "mało", "mniej więcej połowa", "większość", "prawie wszystko", "wszystko"]
    en = ["nothing", "a little", "about half", "most of it", "almost everything", "everything"]
    i = 0 if pct == 0 else 1 if pct < 40 else 2 if pct < 60 else 3 if pct < 85 else 4 if pct < 100 else 5
    return (en if lang == "en" else pl)[i]


def facts_text(f: dict, lang: str) -> str:
    name = re.sub(r"[^\w .'-]", "", str(f.get("name", "")))[:24].strip()
    hard = f.get("level") != "soft"
    pct = pct_of(f)
    done, missing, slips = (clean_list(f.get(k)) for k in ("done", "missing", "slips"))
    if lang == "en":
        tone = "sharp, light swearing allowed" if hard else "gentle"
        return (
            f"Name: {name or 'mate'}. Tone: {tone}. Day: {pct}%, that is {how_much(pct, lang)}. "
            f"Done: {', '.join(done) or 'nothing'}. Missed: {', '.join(missing) or 'nothing'}. "
            f"Slips: {', '.join(slips) or 'none'}."
        )
    tone = "ostry, wolno lekko przeklinać" if hard else "łagodny"
    return (
        f"Imię: {name or 'brak'}. Ton: {tone}. Dzień: {pct}%, czyli {how_much(pct, lang)}. "
        f"Zrobione: {', '.join(done) or 'nic'}. Zabrakło: {', '.join(missing) or 'nic'}. "
        f"Wpadki: {', '.join(slips) or 'brak'}."
    )


# Claims about how much got done, by the lowest percent they're true from (overstating = reject).
CLAIMS = {
    "pl": [(60, r"większoś"), (85, r"prawie wszystk|prawie komplet"), (100, r"\bkomplet|wszystko (zrobion|odhaczon)|perfekcyjn|idealn")],
    "en": [(60, r"\bmost of\b|\bmostly\b"), (85, r"almost (everything|all)"), (100, r"\bperfect\b|everything (done|ticked)|full house")],
}


def overstates(text: str, pct: int, lang: str) -> bool:
    return any(pct < low and re.search(rx, text, re.IGNORECASE) for low, rx in CLAIMS[lang])


def acceptable(text: str, lang: str, pct: int = 100) -> str | None:
    """The comment, tidied up, or None when it breaks a rule."""
    t = EMOJI.sub("", text).replace("\u2014", "-").replace("\u2013", "-").strip().strip('"„”')
    t = re.sub(r"\s+", " ", t)
    if not 30 <= len(t) <= 360:
        return None
    if re.search(r"\d", t) or FORMATTING.search(t):
        return None
    if lang == "pl" and GENDERED.search(t):
        return None
    if overstates(t, pct, lang):
        return None
    return fit(t)


# The comment goes into a phone notification next to a tip; long ones get cut there.
MAX_CHARS = 240


def fit(t: str) -> str | None:
    """At most two sentences and MAX_CHARS, cut between sentences; None if even one is too long."""
    out = ""
    for s in re.split(r"(?<=[.!?])\s+", t)[:2]:
        nxt = f"{out} {s}".strip()
        if len(nxt) > MAX_CHARS:
            break
        out = nxt
    return out if len(out) >= 30 else None


def ollama_chat(messages, temperature: float) -> str:
    body = json.dumps(
        {
            "model": MODEL,
            "stream": False,
            "keep_alive": "5m",
            "options": {
                "num_predict": 110,
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


def pct_of(f: dict) -> int:
    try:
        return max(0, min(100, int(f.get("pct", 0))))
    except (TypeError, ValueError):
        return 0


def comment(f: dict) -> str | None:
    lang = "en" if f.get("lang") == "en" else "pl"
    ex_user, ex_bot = EXAMPLE[lang]
    messages = [
        {"role": "system", "content": SYSTEM[lang]},
        {"role": "user", "content": ex_user},
        {"role": "assistant", "content": ex_bot},
        {"role": "user", "content": facts_text(f, lang)},
    ]
    with GEN_LOCK:
        for temperature in (0.7, 0.4):
            ok = acceptable(ollama_chat(messages, temperature), lang, pct_of(f))
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
