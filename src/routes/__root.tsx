import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, LazyMotion } from "framer-motion";

// Animation features load after the first paint (keeps ~90 KB out of the startup bundle).
const loadMotion = () => import("@/lib/motion-features").then((m) => m.default);

import { Capacitor } from "@capacitor/core";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { refreshNative, startWidgetBridge } from "../lib/widget/bridge";
import {
  getPermissionState,
  requestNotificationPermission,
  syncNotifications,
} from "../lib/notifications";
import { useHabits } from "../lib/habits/store";
import { useLinesReady } from "../lib/habits/szpila";
import { watchTheme } from "../lib/theme";
import { L } from "../lib/i18n";
import { SplashScreen } from "@/components/SplashScreen";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          {L("Nie ma takiej strony", "Page not found")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {L(
            "Strona, której szukasz, nie istnieje albo została przeniesiona.",
            "The page you're looking for doesn't exist or has moved.",
          )}
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {L("Strona główna", "Home")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {L("Nie udało się załadować strony", "Couldn't load the page")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {L(
            "Coś poszło nie tak. Spróbuj odświeżyć albo wróć na stronę główną.",
            "Something went wrong. Try refreshing or head back home.",
          )}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {L("Spróbuj ponownie", "Try again")}
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            {L("Strona główna", "Home")}
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext()({
  head: () => {
    // Evaluated on each head() call; during SSR the language is still "pl".
    const title = L("Szpila - nawyki z pazurem", "Szpila - habits with claws");
    const description = L(
      "Buduj dobre nawyki, rzucaj złe. Utrzymaj serię.",
      "Build good habits, ditch bad ones. Keep the streak.",
    );
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { title },
        { name: "description", content: description },
        { name: "theme-color", content: "#0f0f12" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "apple-mobile-web-app-title", content: "Szpila" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
        {
          property: "og:image",
          content:
            "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5ebe8d17-cac7-4450-bb49-299bedfb8569",
        },
        {
          name: "twitter:image",
          content:
            "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5ebe8d17-cac7-4450-bb49-299bedfb8569",
        },
        { name: "twitter:card", content: "summary_large_image" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "manifest", href: "/manifest.webmanifest" },
        { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
        { rel: "apple-touch-icon", href: "/icon-192.png" },
      ],
      // Set the theme before the first paint (no dark flash for light-theme users).
      scripts: [{ children: THEME_BOOT }],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/** Inline, pre-hydration: the stored theme preference -> <html data-theme>. Mirrors resolveTheme(). */
const THEME_BOOT = `(function(){try{var s=JSON.parse(localStorage.getItem("loop-habits-v1")||"{}").state||{};var p=s.theme||"system";var t=p==="system"?(window.matchMedia&&matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):p;document.documentElement.dataset.theme=t;}catch(e){}})();`;

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);
  // A language switch re-mounts the current screen, so every L() is evaluated again.
  const lang = useHabits((s) => s.language);
  // ...and once more when the (lazily loaded) English lines arrive.
  const enReady = useLinesReady((s) => s.en);

  // Light / dark / like the phone.
  const themePref = useHabits((s) => s.theme);
  useEffect(() => watchTheme(() => themePref), [themePref]);

  // Background work (widget bridge, notification scheduling) waits until the
  // splash has faded out, so the first screen and the fade get the main thread.
  const [booted, setBooted] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 3000); // fallback if the exit never reports
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Mirror habit data to the native Android home-screen widget. No-op on web.
    if (booted) startWidgetBridge();
  }, [booted]);

  useEffect(() => {
    if (!booted) return;
    // Schedule reminders, and reschedule (debounced) whenever habits or
    // notification settings change - keeps per-habit + weekly recap in sync.
    void syncNotifications();
    let t: ReturnType<typeof setTimeout> | undefined;
    const unsub = useHabits.subscribe(() => {
      if (t) clearTimeout(t);
      t = setTimeout(() => void syncNotifications(), 400);
    });
    return () => {
      if (t) clearTimeout(t);
      unsub();
    };
  }, [booted]);

  useEffect(() => {
    // The progress notification and Szpila are on by default, so ask for the
    // notification permission once on the native app (Android 13+ prompt).
    if (!Capacitor.isNativePlatform()) return;
    const { progress, taunts } = useHabits.getState().notifications;
    if (!progress && !taunts) return;
    const t = setTimeout(() => {
      void getPermissionState().then(async (p) => {
        if (p !== "default") return;
        if ((await requestNotificationPermission()) === "granted") {
          refreshNative();
          void syncNotifications();
        }
      });
    }, 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    // Tapping the weekly recap notification opens the report (native only).
    if (!Capacitor.isNativePlatform()) return;
    let remove: (() => void) | undefined;
    void import("@capacitor/local-notifications").then(({ LocalNotifications }) => {
      LocalNotifications.addListener("localNotificationActionPerformed", (e) => {
        if (e.notification.extra?.route === "/report") {
          router.navigate({ to: "/report" });
        }
      }).then((h) => {
        remove = () => void h.remove();
      });
    });
    return () => remove?.();
  }, [router]);

  return (
    <LazyMotion features={loadMotion} strict>
      <PwaRegister />
      <Outlet key={`${lang}-${lang === "en" && enReady}`} />
      {/* Toasts never trap the UI: swipe left/right (or tap ×) to clear, at most 2 at once. */}
      <Toaster
        position="bottom-center"
        swipeDirections={["left", "right"]}
        closeButton
        visibleToasts={2}
        duration={3500}
        offset={{ bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)" }}
        mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)" }}
      />
      <AnimatePresence onExitComplete={() => setBooted(true)}>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      </AnimatePresence>
    </LazyMotion>
  );
}

function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!import.meta.env.PROD) return;
    if (window.self !== window.top) return;
    const h = window.location.hostname;
    const blocked =
      h.startsWith("id-preview--") ||
      h.startsWith("preview--") ||
      h === "lovableproject.com" ||
      h.endsWith(".lovableproject.com") ||
      h === "lovableproject-dev.com" ||
      h.endsWith(".lovableproject-dev.com") ||
      h === "beta.lovable.dev" ||
      h.endsWith(".beta.lovable.dev");
    const killed = new URLSearchParams(window.location.search).get("sw") === "off";
    if (blocked || killed) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => {
          if (r.active?.scriptURL.endsWith("/sw.js")) r.unregister();
        });
      });
      return;
    }
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
