import { motion, AnimatePresence } from "framer-motion";
import { SZPILA_NAME, type SzpilaSay } from "@/lib/habits/szpila";

/** Szpila's little devil face. Mood tints the eyebrows/mouth. */
export function SzpilaAvatar({ mood, size = 56 }: { mood: SzpilaSay["mood"]; size?: number }) {
  const mouth =
    mood === "impressed"
      ? "M22 40 Q32 44 42 40" // grudging smile
      : mood === "smug"
      ? "M22 41 Q34 45 42 37" // smirk
      : "M22 43 Q32 37 42 43"; // scowl
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      {/* horns */}
      <path d="M14 20 L10 4 L24 14 Z" fill="var(--avoid)" />
      <path d="M50 20 L54 4 L40 14 Z" fill="var(--avoid)" />
      <circle cx="32" cy="34" r="24" fill="var(--avoid)" />
      <circle cx="32" cy="34" r="24" fill="url(#szpila-shade)" />
      <defs>
        <radialGradient id="szpila-shade" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.25" />
        </radialGradient>
      </defs>
      {/* brows */}
      <path d={mood === "impressed" ? "M17 25 L28 24" : "M17 22 L28 28"} stroke="#1a0b0d" strokeWidth="3.5" strokeLinecap="round" />
      <path d={mood === "impressed" ? "M47 25 L36 24" : "M47 22 L36 28"} stroke="#1a0b0d" strokeWidth="3.5" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="24" cy="32" r="3.2" fill="#1a0b0d" />
      <circle cx="40" cy="32" r="3.2" fill="#1a0b0d" />
      <circle cx="25" cy="31" r="1" fill="#fff" />
      <circle cx="41" cy="31" r="1" fill="#fff" />
      <path d={mouth} stroke="#1a0b0d" strokeWidth="3.5" fill="none" strokeLinecap="round" />
      {mood !== "impressed" && <path d="M36 41 L38 46 L40 40" fill="#fff" />}
    </svg>
  );
}

export function SzpilaCard({ say, onReroll }: { say: SzpilaSay; onReroll: () => void }) {
  return (
    <button
      type="button"
      onClick={onReroll}
      className="mx-5 mb-6 flex w-[calc(100%-2.5rem)] items-start gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
      style={{
        background: "linear-gradient(135deg, color-mix(in oklab, var(--avoid) 16%, var(--card)), var(--card))",
        border: "1px solid color-mix(in oklab, var(--avoid) 30%, transparent)",
      }}
      aria-label={`${SZPILA_NAME} mówi. Dotknij, by usłyszeć kolejną szpilę.`}
    >
      <motion.div
        key={say.mood}
        initial={{ rotate: -12, scale: 0.8 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 14 }}
        className="shrink-0"
      >
        <SzpilaAvatar mood={say.mood} />
      </motion.div>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: "var(--avoid)" }}>
          {SZPILA_NAME}
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={say.text}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
            className="mt-1 text-sm leading-snug"
          >
            {say.text}
          </motion.p>
        </AnimatePresence>
        <div className="mt-1.5 text-[10px] text-muted-foreground">Dotknij po kolejną szpilę</div>
      </div>
    </button>
  );
}
