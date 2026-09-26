import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.glow_habit_widget",
  appName: "Szpila",
  // Static, client-only SPA build produced by `bun run build:cap`.
  webDir: "dist/client",
  android: {
    // Allow http://localhost asset serving (default) and keep it self-contained.
  },
  plugins: {
    SplashScreen: {
      // The animated in-app splash (src/components/SplashScreen.tsx) hides this
      // native splash as soon as the web layer is ready. launchShowDuration is
      // just a safety fallback in case the JS layer never boots.
      launchShowDuration: 3000,
      launchAutoHide: true,
      backgroundColor: "#0b0d11",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    LocalNotifications: {
      // Status-bar icon: the cat with the pin (res/drawable/ic_stat_szpila.xml), Szpila red.
      smallIcon: "ic_stat_szpila",
      iconColor: "#FF4D5E",
    },
  },
};

export default config;
