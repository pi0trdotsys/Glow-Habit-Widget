import { useEffect } from "react";
import { m } from "framer-motion";
import { Capacitor } from "@capacitor/core";
import { SzpilaAvatar } from "@/components/Szpila";
import { L } from "@/lib/i18n";

// In-app splash: the mean cat pops in, a pin flies into its ear (it flinches),
// then the wordmark rises in and everything fades out. Same art as the app
// icon ("Kot ze szpilką"). The native splash is hidden as soon as this mounts
// so the handoff is seamless (same dark background).
/** How long the in-app splash stays before fading out (the fade adds SPLASH_FADE_S). */
export const SPLASH_MS = 700;
/** Counted from page start (loading/hydration already covered part of it), but the cat + pin get at least this long. */
export const SPLASH_MIN_MS = 380;
const SPLASH_FADE_S = 0.2;

export function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    // Hand off from the native splash immediately (native only, no-op on web).
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/splash-screen")
        .then(({ SplashScreen: Native }) => Native.hide({ fadeOutDuration: 250 }))
        .catch(() => {});
    }
    const t = setTimeout(onDone, Math.max(SPLASH_MIN_MS, SPLASH_MS - performance.now()));
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <m.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background: "radial-gradient(120% 90% at 50% 42%, #2a0f15 0%, #0d0b10 55%, #07090c 100%)",
      }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: SPLASH_FADE_S, ease: "easeInOut" }}
    >
      {/* red glow behind the cat */}
      <m.div
        className="absolute"
        style={{
          width: 280,
          height: 280,
          borderRadius: "9999px",
          background: "radial-gradient(circle, rgba(255,77,94,0.25) 0%, rgba(255,77,94,0) 70%)",
          filter: "blur(6px)",
          marginTop: -60,
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.8], scale: [0.6, 1.1, 1] }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />

      <m.div
        className="relative"
        style={{ width: 132, height: 132 }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, rotate: [0, 0, -7, 4, 0] }}
        transition={{
          scale: { type: "spring", stiffness: 420, damping: 16 },
          opacity: { duration: 0.15 },
          rotate: { duration: 0.6, times: [0, 0.55, 0.7, 0.85, 1] },
        }}
      >
        <SzpilaAvatar mood="smug" size={132} />
        {/* the pin (same geometry as the app icon): flies in and sticks through the right ear */}
        <svg viewBox="0 0 64 64" width={132} height={132} className="absolute inset-0" aria-hidden>
          <m.g
            initial={{ x: 16, y: -5, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.14, ease: "easeIn" }}
          >
            <circle cx="49.9" cy="9" r="1.3" fill="#1a0a0e" />
            <path d="M57.2 6.9 L49.9 9" stroke="#d9dde5" strokeWidth="2.1" strokeLinecap="round" />
            <circle cx="60" cy="6.2" r="3.5" fill="#f1f3f7" stroke="#8e95a3" strokeWidth="0.9" />
            <circle cx="58.9" cy="5.1" r="1.2" fill="#fff" />
          </m.g>
          <m.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.33, duration: 0.05 }}
          >
            <circle cx="43" cy="11" r="1.3" fill="#1a0a0e" />
            <path d="M42.6 9.9 L43.4 12.1 L34.8 13.6 Z" fill="#d9dde5" />
          </m.g>
        </svg>
      </m.div>

      <m.h1
        className="mt-6 font-display text-4xl font-extrabold uppercase"
        style={{ color: "#f4f5f9", letterSpacing: "0.14em", paddingLeft: "0.14em" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.3, ease: "easeOut" }}
      >
        Szpila
      </m.h1>
      <m.p
        className="mt-2 text-xs font-semibold uppercase"
        style={{ color: "#ff4d5e", letterSpacing: "0.42em", paddingLeft: "0.42em" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.3, ease: "easeOut" }}
      >
        {L("nawyki z pazurem", "habits with claws")}
      </m.p>
    </m.div>
  );
}
