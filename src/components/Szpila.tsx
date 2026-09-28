import { useMemo } from "react";
import { m, AnimatePresence } from "framer-motion";
import { SZPILA_NAME, type SzpilaSay } from "@/lib/habits/szpila";
import { useHabits } from "@/lib/habits/store";
import { L } from "@/lib/i18n";
import { catCondition, type CatCondition, type FaceId } from "@/lib/habits/gamification";

const DARK = { face: "#262633", edge: "#3b3b4d" };
const GOLD = { face: "#b8862a", edge: "#f3c656" };
const EYE = "#c6f35e";
const PINK = "#ff7d9c";

/**
 * Szpila, the mean cat. Smug = half-lidded eyes and a one-sided smirk,
 * angry = flattened ears, slit eyes and fangs, impressed = eyes open, grudging smile.
 */
export function SzpilaAvatar({
  mood,
  size = 56,
  face = "wredny",
  condition = "normal",
}: {
  mood: SzpilaSay["mood"];
  size?: number;
  face?: FaceId;
  condition?: CatCondition;
}) {
  const { face: FACE, edge: EDGE } = face === "zloty" ? GOLD : DARK;
  const angry = mood === "angry";
  const impressed = mood === "impressed";
  const eyeRy = angry ? 2.2 : impressed ? 5 : 2.9;
  const ears = angry
    ? {
        l: "M7 31 L11 13 L27 21 Z",
        r: "M57 31 L53 13 L37 21 Z",
        li: "M11 27 L13 18 L22 22 Z",
        ri: "M53 27 L51 18 L42 22 Z",
      }
    : {
        l: "M10 27 L15 5 L28 18 Z",
        r: "M54 27 L49 5 L36 18 Z",
        li: "M14 22 L16 11 L23 17 Z",
        ri: "M50 22 L48 11 L41 17 Z",
      };
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {face === "dj" && (
        <path
          d="M9 40 Q8 9 32 9 Q56 9 55 40"
          stroke="#4a4a5c"
          strokeWidth="3.5"
          fill="none"
          strokeLinecap="round"
        />
      )}
      <path d={ears.l} fill={FACE} stroke={EDGE} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={ears.r} fill={FACE} stroke={EDGE} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={ears.li} fill={PINK} opacity="0.7" />
      <path d={ears.ri} fill={PINK} opacity="0.7" />
      <ellipse cx="32" cy="37" rx="24" ry="21" fill={FACE} stroke={EDGE} strokeWidth="1.5" />
      {/* eyes */}
      {[23, 41].map((x) => (
        <g key={x}>
          <ellipse cx={x} cy="34" rx="5.6" ry={eyeRy} fill={EYE} />
          <ellipse cx={x} cy="34" rx="1.1" ry={Math.max(1, eyeRy - 0.6)} fill="#111" />
        </g>
      ))}
      {angry && (
        <>
          <path d="M16 27 L28 31" stroke="#111" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M48 27 L36 31" stroke="#111" strokeWidth="2.6" strokeLinecap="round" />
        </>
      )}
      {mood === "smug" && (
        <>
          <path
            d="M17 31.5 Q23 29.5 29 31.5"
            stroke={EDGE}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path
            d="M35 31.5 Q41 29.5 47 31.5"
            stroke={EDGE}
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
        </>
      )}
      {/* nose */}
      <path d="M29.5 41 L34.5 41 L32 43.8 Z" fill={PINK} />
      {/* mouth */}
      {angry ? (
        <>
          <path
            d="M26 49 Q32 44.5 38 49"
            stroke="#111"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
          />
          <path d="M28.6 47.2 L29.6 50.6 L30.8 46.6 Z" fill="#fff" />
          <path d="M35.4 47.2 L34.4 50.6 L33.2 46.6 Z" fill="#fff" />
        </>
      ) : impressed ? (
        <path
          d="M27 45.5 Q32 50 37 45.5"
          stroke="#111"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M27.5 45.5 Q31 47.5 33.5 45.8 Q37 44.8 40 41.8"
          stroke="#111"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
      <Accessory face={face} />
      <Condition condition={condition} />
      {/* whiskers */}
      <g stroke="#6b6b80" strokeWidth="1" strokeLinecap="round">
        <path d="M20 43 L6 41" />
        <path d="M20 45.5 L6 47.5" />
        <path d="M44 43 L58 41" />
        <path d="M44 45.5 L58 47.5" />
      </g>
    </svg>
  );
}

/** "Kot w domu" overlays - same shapes as res/drawable/ic_szpila_cond_*.xml. */
function Condition({ condition }: { condition: CatCondition }) {
  if (condition === "groomed") {
    return (
      <g>
        <path
          d="M19 23 Q29 17 41 19.5"
          stroke="#fff"
          strokeOpacity="0.35"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
        <g fill="#fff6c8">
          <path d="M55 12 l1.3 3.2 l3.2 1.3 l-3.2 1.3 l-1.3 3.2 l-1.3 -3.2 l-3.2 -1.3 l3.2 -1.3 Z" />
          <path d="M7 18 l0.9 2.2 l2.2 0.9 l-2.2 0.9 l-0.9 2.2 l-0.9 -2.2 l-2.2 -0.9 l2.2 -0.9 Z" />
          <path d="M59 44 l0.8 1.9 l1.9 0.8 l-1.9 0.8 l-0.8 1.9 l-0.8 -1.9 l-1.9 -0.8 l1.9 -0.8 Z" />
        </g>
        <g fill="#ff4d5e" stroke="#b3122a" strokeWidth="0.8" strokeLinejoin="round">
          <path d="M32 58 L24.5 54.2 L24.5 61.8 Z" />
          <path d="M32 58 L39.5 54.2 L39.5 61.8 Z" />
        </g>
        <circle cx="32" cy="58" r="2" fill="#b3122a" />
      </g>
    );
  }
  if (condition === "neglected") {
    return (
      <g>
        <g stroke="#55556a" fill="none" strokeLinecap="round" strokeLinejoin="round">
          <path
            d="M24 17 L26 11.5 L28.5 16 L31 10.5 L33.5 16 L36 11.5 L38.5 17"
            strokeWidth="1.8"
          />
          <path d="M8.5 37 L3.5 35.5 L8 40.5 L2.5 42 L8.5 45" strokeWidth="1.6" />
          <path d="M55.5 37 L60.5 35.5 L56 40.5 L61.5 42 L55.5 45" strokeWidth="1.6" />
        </g>
        <g stroke="#8a6a9a" strokeWidth="1.3" fill="none" strokeLinecap="round">
          <path d="M17.5 39.2 Q23 42 28.5 39.2" />
          <path d="M35.5 39.2 Q41 42 46.5 39.2" />
        </g>
        <g transform="rotate(-28 44 24)">
          <rect
            x="35.5"
            y="21.5"
            width="17"
            height="5"
            rx="2"
            fill="#f2c9a0"
            stroke="#c99a6e"
            strokeWidth="0.6"
          />
          <rect x="41.5" y="21.5" width="5" height="5" fill="#e8b98a" />
        </g>
        <circle cx="56.1" cy="11" r="1.4" fill="#111" />
        <ellipse cx="55.9" cy="9.3" rx="1.5" ry="1" fill="#dde3ee" opacity="0.8" />
        <circle cx="7.5" cy="15" r="1.2" fill="#111" />
        <ellipse cx="7.4" cy="13.5" rx="1.3" ry="0.9" fill="#dde3ee" opacity="0.8" />
        <path
          d="M59 14 Q61.5 16 60 18.5 M3.5 18 Q2 20 4 22"
          stroke="#8e95a3"
          strokeWidth="0.7"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    );
  }
  return null;
}

/** The cat's current condition from the store (memoized). */
export function useCatCondition(): CatCondition {
  const habits = useHabits((s) => s.habits);
  const completions = useHabits((s) => s.completions);
  return useMemo(() => catCondition(habits, completions), [habits, completions]);
}

/** Neglected = offended (angry) whatever it says; groomed = pleased instead of smug. */
export function conditionMood(condition: CatCondition, mood: SzpilaSay["mood"]): SzpilaSay["mood"] {
  if (condition === "neglected") return "angry";
  if (condition === "groomed" && mood === "smug") return "impressed";
  return mood;
}

/** Unlockable extras drawn over the cat (see gamification.ts FACES). */
function Accessory({ face }: { face: FaceId }) {
  switch (face) {
    case "kujon":
      return (
        <g stroke="#e8e8f0" strokeWidth="1.8" fill="rgba(200,220,255,0.12)">
          <circle cx="23" cy="34" r="7.2" />
          <circle cx="41" cy="34" r="7.2" />
          <path d="M30.2 33.5 Q32 32 33.8 33.5" fill="none" />
          <path d="M15.8 33 L9 30.5 M48.2 33 L55 30.5" fill="none" />
        </g>
      );
    case "diabel":
      return (
        <g fill="#ff4d5e" stroke="#b3122a" strokeWidth="1" strokeLinejoin="round">
          <path d="M22 19 Q17 12 20 4 Q23 12 28 16 Z" />
          <path d="M42 19 Q47 12 44 4 Q41 12 36 16 Z" />
        </g>
      );
    case "krol":
      return (
        <g>
          <path
            d="M21 18 L22.5 6 L27.5 12 L32 3.5 L36.5 12 L41.5 6 L43 18 Z"
            fill="#fdba2f"
            stroke="#b07d12"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <circle cx="32" cy="13.5" r="1.8" fill="#ff4d5e" />
          <circle cx="25.5" cy="14.5" r="1.2" fill="#55c4fe" />
          <circle cx="38.5" cy="14.5" r="1.2" fill="#55c4fe" />
        </g>
      );
    case "zloty":
      return (
        <g fill="#fff6c8">
          <path d="M51 16 l1.2 3 l3 1.2 l-3 1.2 l-1.2 3 l-1.2 -3 l-3 -1.2 l3 -1.2 Z" />
          <path d="M11 50 l0.9 2.2 l2.2 0.9 l-2.2 0.9 l-0.9 2.2 l-0.9 -2.2 l-2.2 -0.9 l2.2 -0.9 Z" />
        </g>
      );
    case "dj":
      return (
        <g fill="#ff4d5e" stroke="#7a1422" strokeWidth="1">
          <rect x="3.5" y="33" width="9" height="15" rx="4" />
          <rect x="51.5" y="33" width="9" height="15" rx="4" />
        </g>
      );
    default:
      return null;
  }
}

/** Full card (settings / detail use). */
export function SzpilaCard({ say, onReroll }: { say: SzpilaSay; onReroll: () => void }) {
  return (
    <button
      type="button"
      onClick={onReroll}
      className="mx-5 mb-6 flex w-[calc(100%-2.5rem)] items-start gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--avoid) 16%, var(--card)), var(--card))",
        border: "1px solid color-mix(in oklab, var(--avoid) 30%, transparent)",
      }}
      aria-label={L(
        `${SZPILA_NAME} mówi. Dotknij, by usłyszeć kolejną szpilę.`,
        `${SZPILA_NAME} says. Tap for another jab.`,
      )}
    >
      <Face mood={say.mood} size={56} />
      <div className="min-w-0 flex-1">
        <div
          className="text-xs font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--avoid)" }}
        >
          {SZPILA_NAME}
        </div>
        <Line text={say.text} className="mt-1 text-sm leading-snug" />
        <div className="mt-1.5 text-xs text-muted-foreground">
          {L("Dotknij po kolejną szpilę", "Tap for another jab")}
        </div>
      </div>
    </button>
  );
}

/** One compact bubble for the Fokus home screen: face + two lines, tap for another jab. */
export function SzpilaBubble({
  say,
  onReroll,
  hop = false,
}: {
  say: SzpilaSay;
  onReroll: () => void;
  /** The cat hops (a step was just completed). */
  hop?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onReroll}
      data-szpila-bubble
      data-mood={say.mood}
      className="flex h-full w-full items-center gap-2.5 rounded-2xl px-3 py-2 text-left transition-transform active:scale-[0.99]"
      style={{
        background: "color-mix(in oklab, var(--avoid) 9%, var(--card))",
        border: "1px solid color-mix(in oklab, var(--avoid) 22%, transparent)",
      }}
      aria-label={`${SZPILA_NAME}: ${say.text}. ${L("Dotknij po kolejną szpilę.", "Tap for another jab.")}`}
    >
      <Face mood={say.mood} size={44} hop={hop} />
      <Line text={say.text} className="line-clamp-3 min-w-0 flex-1 text-sm leading-snug" />
    </button>
  );
}

function Face({
  mood,
  size,
  hop = false,
}: {
  mood: SzpilaSay["mood"];
  size: number;
  hop?: boolean;
}) {
  const face = useHabits((s) => s.szpila.face);
  const condition = useCatCondition();
  // A fresh success beats a sulk: the hop shows the pleased face even on a neglected cat.
  if (!hop) mood = conditionMood(condition, mood);
  return (
    <m.div
      key={`${mood}-${hop}`}
      initial={{ rotate: -10, scale: 0.85, y: 0 }}
      animate={
        hop
          ? { rotate: [0, -8, 8, 0], scale: 1, y: [0, -10, 0, -4, 0] }
          : { rotate: 0, scale: 1, y: 0 }
      }
      transition={
        hop ? { duration: 0.7, ease: "easeOut" } : { type: "spring", stiffness: 400, damping: 14 }
      }
      className="shrink-0"
    >
      <SzpilaAvatar mood={mood} size={size} face={face} condition={condition} />
    </m.div>
  );
}

function Line({ text, className }: { text: string; className: string }) {
  return (
    <AnimatePresence mode="wait">
      <m.p
        key={text}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.18 }}
        className={className}
      >
        {text}
      </m.p>
    </AnimatePresence>
  );
}
