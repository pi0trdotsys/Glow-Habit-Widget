import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";

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
import { SplashScreen } from "@/components/SplashScreen";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Nie ma takiej strony</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Strona, której szukasz, nie istnieje albo została przeniesiona.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Strona główna
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
          Nie udało się załadować strony
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Coś poszło nie tak. Spróbuj odświeżyć albo wróć na stronę główną.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Spróbuj ponownie
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Strona główna
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Loop - nawyki" },
      { name: "description", content: "Buduj dobre nawyki, rzucaj złe. Utrzymaj serię." },
      { name: "theme-color", content: "#0f0f12" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Loop" },
      { property: "og:title", content: "Loop - nawyki" },
      { property: "og:description", content: "Buduj dobre nawyki, rzucaj złe. Utrzymaj serię." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Loop - nawyki" },
      { name: "twitter:description", content: "Buduj dobre nawyki, rzucaj złe. Utrzymaj serię." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5ebe8d17-cac7-4450-bb49-299bedfb8569" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/5ebe8d17-cac7-4450-bb49-299bedfb8569" },
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
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

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
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Mirror habit data to the native Android home-screen widget. No-op on web.
    startWidgetBridge();
  }, []);

  useEffect(() => {
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
  }, []);

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
    <QueryClientProvider client={queryClient}>
      <PwaRegister />
      <Outlet />
      <Toaster
        position="bottom-center"
        offset={{ bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)" }}
        mobileOffset={{ bottom: "calc(env(safe-area-inset-bottom) + 6.5rem)" }}
      />
      <AnimatePresence>
        {showSplash && <SplashScreen onDone={() => setShowSplash(false)} />}
      </AnimatePresence>
    </QueryClientProvider>
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
      h === "lovableproject.com" || h.endsWith(".lovableproject.com") ||
      h === "lovableproject-dev.com" || h.endsWith(".lovableproject-dev.com") ||
      h === "beta.lovable.dev" || h.endsWith(".beta.lovable.dev");
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
