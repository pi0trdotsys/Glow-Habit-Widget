import { useEffect } from "react";
import { motion } from "framer-motion";
import { Capacitor } from "@capacitor/core";

// Impressive in-app splash: the Loop mark draws itself, pulses, and the
// wordmark rises in, then the whole thing fades out. Replaces the previous
// static native splash image (which felt "dead"). The native splash is hidden
// as soon as this mounts so the handoff is seamless (same dark background).
export function SplashScreen({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    // Hand off from the native splash immediately (native only, no-op on web).
    if (Capacitor.isNativePlatform()) {
      void import("@capacitor/splash-screen")
        .then(({ SplashScreen: Native }) => Native.hide({ fadeOutDuration: 250 }))
        .catch(() => {});
    }
    const t = setTimeout(onDone, 2300);
    return () => clearTimeout(t);
  }, [onDone]);

  const R = 34;
  const HEAD_ANGLE = -90; // start at top

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
      style={{
        background:
          "radial-gradient(120% 120% at 50% 35%, #12161d 0%, #0b0d11 60%, #07090c 100%)",
      }}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04 }}
      transition={{ duration: 0.5, ease: "easeInOut" }}
    >
      {/* soft glow behind the mark */}
      <motion.div
        className="absolute"
        style={{
          width: 260,
          height: 260,
          borderRadius: "9999px",
          background:
            "radial-gradient(circle, rgba(96,231,180,0.22) 0%, rgba(96,231,180,0) 70%)",
          filter: "blur(6px)",
        }}
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.8], scale: [0.6, 1.1, 1] }}
        transition={{ duration: 1.6, ease: "easeOut" }}
      />

      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: [0.9, 1.06, 1] }}
        transition={{ duration: 1.8, ease: "easeOut", times: [0, 0.6, 1] }}
        className="relative"
      >
        <svg width={132} height={132} viewBox="0 0 100 100">
          <defs>
            <linearGradient id="loopGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a7f3d0" />
              <stop offset="55%" stopColor="#60e7b4" />
              <stop offset="100%" stopColor="#2dd4a7" />
            </linearGradient>
          </defs>
          {/* faint track */}
          <circle cx="50" cy="50" r={R} fill="none" stroke="#1c2530" strokeWidth="10" />
          {/* drawing ring (leaves a gap like the logo) */}
          <motion.circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="url(#loopGrad)"
            strokeWidth="10"
            strokeLinecap="round"
            transform="rotate(-90 50 50)"
            initial={{ pathLength: 0, opacity: 0.4 }}
            animate={{ pathLength: 0.82, opacity: 1 }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
          />
          {/* head dot */}
          <motion.circle
            cx={50 + R * Math.cos((HEAD_ANGLE * Math.PI) / 180)}
            cy={50 + R * Math.sin((HEAD_ANGLE * Math.PI) / 180)}
            r="7"
            fill="#c7f9e5"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.4, ease: "backOut" }}
            style={{ transformOrigin: "center" }}
          />
        </svg>
      </motion.div>

      <motion.h1
        className="mt-7 font-display text-4xl font-bold tracking-tight"
        style={{ color: "#f4f5f9" }}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.7, duration: 0.5, ease: "easeOut" }}
      >
        Loop
      </motion.h1>
      <motion.p
        className="mt-2 text-[11px] font-semibold uppercase"
        style={{ color: "#60e7b4", letterSpacing: "0.42em", paddingLeft: "0.42em" }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.0, duration: 0.5, ease: "easeOut" }}
      >
        Nawyki
      </motion.p>
    </motion.div>
  );
}
