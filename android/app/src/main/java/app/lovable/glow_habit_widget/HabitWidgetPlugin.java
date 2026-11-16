package app.lovable.glow_habit_widget;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;

/**
 * Native helpers for the web app: widget/notification refresh and backups
 * (see src/lib/widget/bridge.ts and src/lib/backup.ts).
 */
@CapacitorPlugin(
    name = "HabitWidget",
    // READ_CALENDAR: busy meetings of the calendars picked in Settings (CalendarBusy).
    permissions = { @Permission(alias = "calendar", strings = { android.Manifest.permission.READ_CALENDAR }) }
)
public class HabitWidgetPlugin extends Plugin {
    /**
     * Haptic feedback for habit taps: { kind: "tick" | "success" | "celebrate" }.
     * Uses the view's haptics (no VIBRATE permission, respects the system setting).
     */
    @PluginMethod
    public void haptic(PluginCall call) {
        String kind = call.getString("kind", "tick");
        android.view.View v = getBridge().getWebView();
        getActivity().runOnUiThread(() -> {
            int c;
            if ("success".equals(kind)) {
                c = Build.VERSION.SDK_INT >= 30 ? android.view.HapticFeedbackConstants.CONFIRM
                    : android.view.HapticFeedbackConstants.LONG_PRESS;
            } else if ("celebrate".equals(kind)) {
                c = android.view.HapticFeedbackConstants.LONG_PRESS;
            } else {
                c = android.view.HapticFeedbackConstants.CLOCK_TICK;
            }
            v.performHapticFeedback(c);
            if ("celebrate".equals(kind)) {
                v.postDelayed(() -> v.performHapticFeedback(android.view.HapticFeedbackConstants.LONG_PRESS), 140);
                v.postDelayed(() -> v.performHapticFeedback(Build.VERSION.SDK_INT >= 30
                    ? android.view.HapticFeedbackConstants.CONFIRM : android.view.HapticFeedbackConstants.LONG_PRESS), 300);
            }
        });
        call.resolve();
    }

    /** Light or dark system bar icons to match the app theme: { light: true } = dark icons on a light app. */
    @PluginMethod
    public void systemBars(PluginCall call) {
        boolean light = Boolean.TRUE.equals(call.getBoolean("light", false));
        String bg = call.getString("background", light ? "#f6f7fb" : "#0b0d11");
        getActivity().runOnUiThread(() -> {
            android.view.Window w = getActivity().getWindow();
            androidx.core.view.WindowInsetsControllerCompat c =
                androidx.core.view.WindowCompat.getInsetsController(w, w.getDecorView());
            c.setAppearanceLightStatusBars(light);
            c.setAppearanceLightNavigationBars(light);
            try {
                int color = android.graphics.Color.parseColor(bg);
                w.getDecorView().setBackgroundColor(color);
                if (Build.VERSION.SDK_INT < 35) {
                    w.setStatusBarColor(color);
                    w.setNavigationBarColor(color);
                }
            } catch (Exception ignored) {
            }
        });
        call.resolve();
    }

    /**
     * Launcher icon for a theme: { theme: "glitch" } (unknown = dark). Only remembered here -
     * MainActivity switches it once the app leaves the screen (AppIcon). Resolves
     * { pending, active }.
     */
    @PluginMethod
    public void setAppIcon(PluginCall call) {
        String theme = AppIcon.normalize(call.getString("theme", AppIcon.DEFAULT));
        AppIcon.setPending(getContext(), theme);
        JSObject r = new JSObject();
        r.put("pending", theme);
        r.put("active", AppIcon.active(getContext()));
        call.resolve(r);
    }

    @PluginMethod
    public void refresh(PluginCall call) {
        WidgetShared.updateAll(getContext());
        call.resolve();
    }

    /** "Co na ciebie działa": the native jab log, outcomes settled first ({ entries: JabEntry[] }). */
    @PluginMethod
    public void jabStats(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            JabLearn.evaluate(getContext());
            ret.put("entries", new JSArray(JabLearn.log(getContext()).toString()));
        } catch (Exception e) {
            ret.put("entries", new JSArray());
        }
        call.resolve(ret);
    }

    /** Saves { name, json } to Download/Loop; with share=true opens the system share sheet. */
    @PluginMethod
    public void saveBackup(PluginCall call) {
        String name = call.getString("name", "szpila-kopia.json");
        String json = call.getString("json");
        boolean share = Boolean.TRUE.equals(call.getBoolean("share", false));
        if (json == null) {
            call.reject("json missing");
            return;
        }
        try {
            BackupStore.Saved saved = BackupStore.write(getContext(), name, json);
            if (share) {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("application/json");
                send.putExtra(Intent.EXTRA_STREAM, saved.uri);
                send.putExtra(Intent.EXTRA_SUBJECT, WidgetShared.tr(getContext(), "Szpila - kopia zapasowa", "Szpila - backup"));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, WidgetShared.tr(getContext(), "Udostępnij kopię zapasową", "Share backup"));
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }
            JSObject ret = new JSObject();
            ret.put("location", saved.location);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(WidgetShared.tr(getContext(), "Nie udało się zapisać kopii: ", "Couldn't save the backup: ") + e.getMessage());
        }
    }

    /** Saves { name, text, mime } to Download/<app>; share=true opens the share sheet (CSV export). */
    @PluginMethod
    public void saveFile(PluginCall call) {
        String name = call.getString("name", "szpila.csv");
        String text = call.getString("text");
        String mime = call.getString("mime", "text/csv");
        boolean share = Boolean.TRUE.equals(call.getBoolean("share", false));
        if (text == null) {
            call.reject("text missing");
            return;
        }
        try {
            BackupStore.Saved saved = BackupStore.write(getContext(), BackupStore.Dir.EXPORT, name, text, mime);
            if (share) {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType(mime);
                send.putExtra(Intent.EXTRA_STREAM, saved.uri);
                send.putExtra(Intent.EXTRA_SUBJECT, name);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, WidgetShared.tr(getContext(), "Udostępnij plik", "Share file"));
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }
            JSObject ret = new JSObject();
            ret.put("location", saved.location);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(WidgetShared.tr(getContext(), "Nie udało się zapisać pliku: ", "Couldn't save the file: ") + e.getMessage());
        }
    }

    /**
     * Night guard state: installed watched apps, visits per night, whether it's running.
     * -> { granted, running, apps: [{ pkg, label, installed }], hits: { "yyyy-MM-dd": n } }
     */
    @PluginMethod
    public void liveStatus(PluginCall call) {
        JSArray apps = new JSArray();
        java.util.Set<String> seen = new java.util.HashSet<>();
        for (java.util.Map.Entry<String, String[]> e : LiveGuard.SOCIAL.entrySet()) {
            boolean installed = LiveGuard.installed(getContext(), e.getKey());
            if (!installed && !seen.add(e.getValue()[0])) continue;
            JSObject a = new JSObject();
            a.put("pkg", e.getKey());
            a.put("label", e.getValue()[1]);
            a.put("installed", installed);
            apps.put(a);
        }
        JSObject ret = new JSObject();
        ret.put("granted", ScreenTime.granted(getContext()));
        ret.put("running", LiveGuardService.running);
        ret.put("overlay", Settings.canDrawOverlays(getContext()));
        ret.put("apps", apps);
        try {
            ret.put("hits", new JSObject(LiveGuard.hits(getContext()).toString()));
            ret.put("blocks", new JSObject(LiveGuard.counts(getContext(), "blocks").toString()));
            ret.put("passes", new JSObject(LiveGuard.counts(getContext(), "passes").toString()));
            // Daily limit: social media minutes per day (05:00-bedtime) and the guard phase now.
            ret.put("day", new JSObject(DayGuard.history(getContext()).toString()));
            ret.put("phase", new String[]{"off", "night", "morning", "day"}[DayGuard.phase(getContext())]);
            ret.put("morningBlocks", new JSObject(LiveGuard.counts(getContext(), "morning_blocks").toString()));
            // Curfew + night debt (today's limit after last night).
            ret.put("curfewBlocks", new JSObject(LiveGuard.counts(getContext(), "curfew_blocks").toString()));
            ret.put("curfewPasses", new JSObject(LiveGuard.counts(getContext(), "curfew_passes").toString()));
            int base = DayGuard.baseLimit(getContext());
            ret.put("limitBase", base);
            ret.put("debt", DayGuard.debtNow(getContext()));
            // "Bank minut": the mode, earned today, today's actual limit and the per-day record.
            boolean bank = DayGuard.bankMode(getContext());
            int limit = DayGuard.limit(getContext());
            ret.put("limitMode", bank ? "bank" : "fixed");
            ret.put("bankEarned", DayGuard.bankEarned(getContext()));
            ret.put("limit", limit);
            if (DayGuard.config(getContext()).day && WidgetShared.nowMinute() >= DayGuard.DAY_START) {
                DayGuard.noteLimit(getContext(), limit);
            }
            ret.put("dayLimit", new JSObject(DayGuard.limitHistory(getContext()).toString()));
            // "24 h do namysłu": per calendar day, the shopping apps and an active pass.
            ret.put("shopBlocks", new JSObject(LiveGuard.counts(getContext(), "shop_blocks").toString()));
            ret.put("shopPasses", new JSObject(LiveGuard.counts(getContext(), "shop_passes").toString()));
            ret.put("shopWish", new JSObject(LiveGuard.counts(getContext(), "shop_wish").toString()));
            ret.put("shopPassUntil", ShopGuard.passUntil(getContext()));
            JSArray shops = new JSArray();
            for (java.util.Map.Entry<String, String> e : ShopGuard.SHOP.entrySet()) {
                JSObject a = new JSObject();
                a.put("pkg", e.getKey());
                a.put("label", e.getValue());
                a.put("installed", LiveGuard.installed(getContext(), e.getKey()));
                shops.put(a);
            }
            ret.put("shopApps", shops);
        } catch (Exception e) {
            ret.put("hits", new JSObject());
        }
        call.resolve(ret);
    }

    /** "Kupuję" on a wishlist item that waited 24 h: { minutes } of shopping without the block. */
    @PluginMethod
    public void shopPass(PluginCall call) {
        int minutes = call.getInt("minutes", ShopGuard.passMin(getContext()));
        ShopGuard.pass(getContext(), minutes);
        JSObject ret = new JSObject();
        ret.put("until", ShopGuard.passUntil(getContext()));
        call.resolve(ret);
    }

    /** A screen the native side wants opened (e.g. the shopping block's "add to the list"): { route } once, "" if none. */
    @PluginMethod
    public void pendingRoute(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("route", ShopGuard.takePendingRoute(getContext()));
        call.resolve(ret);
    }

    /** Launchable apps for the curfew's allow list (the always-allowed ones left out): [{pkg, label}]. */
    @PluginMethod
    public void curfewApps(PluginCall call) {
        android.content.pm.PackageManager pm = getContext().getPackageManager();
        java.util.Set<String> essential = LiveGuard.essentialApps(getContext());
        java.util.Map<String, String> apps = new java.util.TreeMap<>();
        Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
        for (android.content.pm.ResolveInfo r : pm.queryIntentActivities(launcher, 0)) {
            String pkg = r.activityInfo.packageName;
            if (essential.contains(pkg) || apps.containsKey(pkg)) continue;
            apps.put(pkg, r.loadLabel(pm).toString());
        }
        JSArray list = new JSArray();
        for (java.util.Map.Entry<String, String> e : apps.entrySet()) {
            JSObject o = new JSObject();
            o.put("pkg", e.getKey());
            o.put("label", e.getValue());
            o.put("social", LiveGuard.SOCIAL.containsKey(e.getKey()));
            list.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("apps", list);
        call.resolve(ret);
    }

    /** "Draw over other apps" for the night guard's full-screen block. */
    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
        } catch (Exception e) {
            Intent fallback = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    /**
     * The night after habit day { daysAgo } (default 1 = last night): social
     * media visits/minutes per app after midnight, screen minutes, asleep time.
     */
    @PluginMethod
    public void nightReport(PluginCall call) {
        int daysAgo = call.getInt("daysAgo", 1);
        try {
            call.resolve(new JSObject(NightStats.report(getContext(), daysAgo).toString()));
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }

    /**
     * Asks the launcher to place a widget on the home screen (system "Add widget?"
     * dialog) - for launchers that don't list new widgets right after an update.
     * { kind: "szpila" | "next" | "icons" | "list" } -> { supported }
     */
    @PluginMethod
    public void pinWidget(PluginCall call) {
        String kind = call.getString("kind", "szpila");
        Class<?> cls = "next".equals(kind) ? NextTaskWidgetProvider.class
            : "icons".equals(kind) ? HabitWidget2Provider.class
            : "list".equals(kind) ? HabitWidgetProvider.class
            : SzpilaWidgetProvider.class;
        AppWidgetManager mgr = AppWidgetManager.getInstance(getContext());
        boolean supported = Build.VERSION.SDK_INT >= 26 && mgr.isRequestPinAppWidgetSupported();
        if (supported) supported = mgr.requestPinAppWidget(new ComponentName(getContext(), cls), null, null);
        JSObject ret = new JSObject();
        ret.put("supported", supported);
        call.resolve(ret);
    }

    @PluginMethod
    public void backupInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("lastAuto", BackupStore.lastAuto(getContext()));
        call.resolve(ret);
    }

    // ------------------------------------------------------------------
    // In-app updates (UpdateManager; src/lib/update.ts finds the GitHub release)
    // ------------------------------------------------------------------

    /** The coach server: { url, hasToken } (the token itself never goes back to the web side). */
    @PluginMethod
    public void getCoach(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("url", CoachClient.url(getContext()));
        ret.put("hasToken", CoachClient.configured(getContext()));
        call.resolve(ret);
    }

    /** { url, token? } -> saved (empty url = off); { ok:false } when the url isn't https. */
    @PluginMethod
    public void setCoach(PluginCall call) {
        boolean ok = CoachClient.save(getContext(), call.getString("url", ""), call.getString("token", ""));
        JSObject ret = new JSObject();
        ret.put("ok", ok);
        call.resolve(ret);
    }

    /**
     * "Wyślij próbne podsumowanie": posts today's recap now and, with a coach server, asks it right
     * here (no background job, so it can't be postponed) and swaps the comment in. Resolves
     * { status: coach | plain | nothing | blocked, comment?, error?, ms? } once it's known.
     */
    @PluginMethod
    public void testSummary(PluginCall call) {
        final android.content.Context c = getContext();
        final String[] r = HabitNotifier.testSummary(c);
        JSObject ret = new JSObject();
        ret.put("status", r[0]);
        if (!"coach".equals(r[0])) {
            call.resolve(ret);
            return;
        }
        new Thread(() -> {
            long t0 = System.currentTimeMillis();
            try {
                String comment = CoachClient.comment(c, new org.json.JSONObject(r[4]));
                if (comment != null) HabitNotifier.coachSummary(c, r[1], comment, r[6], r[5]);
                ret.put("comment", comment != null ? HabitNotifier.coachText(comment) : null);
                if (comment == null) ret.put("error", "rejected");
            } catch (SecurityException e) {
                ret.put("error", "token");
            } catch (Exception e) {
                ret.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            }
            ret.put("ms", System.currentTimeMillis() - t0);
            call.resolve(ret);
        }, "coach-test-summary").start();
    }

    /** The last day recap as shown: { title, text, at, ai } or {} (the "/recap" screen). */
    @PluginMethod
    public void lastRecap(PluginCall call) {
        org.json.JSONObject r = HabitNotifier.lastRecap(getContext());
        JSObject ret = new JSObject();
        if (r != null) {
            ret.put("title", r.optString("title"));
            ret.put("text", r.optString("text"));
            ret.put("at", r.optLong("at"));
            ret.put("ai", r.optBoolean("ai"));
        }
        call.resolve(ret);
    }

    /** The recap history: { items: [{ day, title, text, at, ai }] }, newest first. */
    @PluginMethod
    public void recaps(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            ret.put("items", new com.getcapacitor.JSArray(HabitNotifier.recaps(getContext()).toString()));
        } catch (Exception e) {
            ret.put("items", new com.getcapacitor.JSArray());
        }
        call.resolve(ret);
    }

    /** Checks the saved server: { ok, model? , error? } (off the main thread). */
    @PluginMethod
    public void testCoach(PluginCall call) {
        new Thread(() -> {
            JSObject ret = new JSObject();
            try {
                ret.put("model", CoachClient.health(getContext()));
                ret.put("ok", true);
            } catch (SecurityException e) {
                ret.put("ok", false);
                ret.put("error", "token");
            } catch (Exception e) {
                ret.put("ok", false);
                ret.put("error", String.valueOf(e.getMessage()));
            }
            call.resolve(ret);
        }, "coach-test").start();
    }

    @PluginMethod
    public void updateHint(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", UpdateManager.hint(getContext()));
        call.resolve(ret);
    }

    @PluginMethod
    public void appVersion(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("name", UpdateManager.installedVersionName(getContext()));
        try {
            ret.put("code", UpdateManager.installedVersionCode(getContext()));
        } catch (Exception e) {
            ret.put("code", 0);
        }
        call.resolve(ret);
    }

    /**
     * { url, sha256? } -> downloads and verifies the release APK; "updateProgress" events
     * { received, total } while downloading. Resolves { ok } or { ok: false, error }.
     */
    @PluginMethod
    public void downloadUpdate(PluginCall call) {
        String url = call.getString("url");
        String sha = call.getString("sha256", "");
        new Thread(() -> {
            JSObject ret = new JSObject();
            try {
                java.io.File apk = UpdateManager.download(getContext(), url, (received, total) -> {
                    JSObject p = new JSObject();
                    p.put("received", received);
                    p.put("total", total);
                    notifyListeners("updateProgress", p);
                });
                String problem = UpdateManager.verify(getContext(), apk, sha);
                if (problem != null) {
                    //noinspection ResultOfMethodCallIgnored
                    apk.delete();
                    ret.put("ok", false);
                    ret.put("error", problem);
                } else {
                    ret.put("ok", true);
                }
            } catch (Exception e) {
                ret.put("ok", false);
                ret.put("error", e.getMessage());
            }
            call.resolve(ret);
        }, "szpila-update").start();
    }

    /**
     * Installs the downloaded update: { status: "started" } (system installer shown),
     * "permission" (opened "Install unknown apps" - call again after allowing it) or "missing".
     */
    @PluginMethod
    public void installUpdate(PluginCall call) {
        JSObject ret = new JSObject();
        java.io.File apk = UpdateManager.downloaded(getContext());
        if (apk == null) {
            ret.put("status", "missing");
        } else if (!UpdateManager.canInstall(getContext())) {
            UpdateManager.openInstallPermission(getContext());
            ret.put("status", "permission");
        } else {
            UpdateManager.install(getContext(), apk);
            ret.put("status", "started");
        }
        call.resolve(ret);
    }

    /** Backups in Download/Szpila/Kopie (+ /Automatyczne), newest first: { backups: [...] }. */
    @PluginMethod
    public void listBackups(PluginCall call) {
        getBridge().execute(() -> {
            JSArray arr = new JSArray();
            for (BackupStore.Entry e : BackupStore.list(getContext())) {
                JSObject o = new JSObject();
                o.put("id", e.id);
                o.put("name", e.name);
                o.put("auto", e.auto);
                o.put("size", e.size);
                o.put("modified", e.modified);
                arr.put(o);
            }
            JSObject ret = new JSObject();
            ret.put("backups", arr);
            call.resolve(ret);
        });
    }

    /** The JSON of one listed backup ({ id } from listBackups): { json }. */
    @PluginMethod
    public void readBackup(PluginCall call) {
        String id = call.getString("id");
        getBridge().execute(() -> {
            try {
                JSObject ret = new JSObject();
                ret.put("json", BackupStore.read(getContext(), id));
                call.resolve(ret);
            } catch (Exception e) {
                call.reject(e.getMessage());
            }
        });
    }

    @PluginMethod
    public void deleteBackup(PluginCall call) {
        String id = call.getString("id");
        JSObject ret = new JSObject();
        ret.put("deleted", id != null && BackupStore.delete(getContext(), id));
        call.resolve(ret);
    }

    // ------------------------------------------------------------------
    // Health Connect steps
    // ------------------------------------------------------------------

    private JSObject stepsState() {
        JSObject ret = new JSObject();
        ret.put("available", HealthSteps.available(getContext()));
        ret.put("granted", HealthSteps.granted(getContext()));
        ret.put("background", HealthSteps.backgroundGranted(getContext()));
        // Sleep (night bill): requestSteps asks for it too - Health Connect shows only what's missing.
        ret.put("sleep", HealthSleep.granted(getContext()));
        return ret;
    }

    @PluginMethod
    public void stepsStatus(PluginCall call) {
        call.resolve(stepsState());
    }

    /** Opens Health Connect's permission screen (steps + sleep + background); resolves with the new status. */
    @PluginMethod
    public void requestSteps(PluginCall call) {
        if (!HealthSteps.available(getContext())) {
            call.resolve(stepsState());
            return;
        }
        startActivityForResult(call, HealthSteps.requestIntent(getContext()), "onStepsPermission");
    }

    @ActivityCallback
    private void onStepsPermission(PluginCall call, ActivityResult result) {
        if (call == null) return;
        call.resolve(stepsState());
    }

    /** { source? } - "auto", a package, or missing = the source saved in the snapshot. */
    @PluginMethod
    public void readSteps(PluginCall call) {
        JSObject ret = new JSObject();
        String source = call.getString("source");
        ret.put("steps", source != null ? HealthSteps.today(getContext(), StepsPick.normalize(source))
            : HealthSteps.today(getContext()));
        call.resolve(ret);
    }

    /** Apps writing steps today: { sources: [{pkg, label, steps}], wearable: {pkg, label} | null }. */
    @PluginMethod
    public void stepsSources(PluginCall call) {
        JSArray list = new JSArray();
        for (kotlin.Pair<String, Long> s : HealthSteps.sources(getContext())) {
            JSObject o = new JSObject();
            o.put("pkg", s.getFirst());
            o.put("label", appLabel(s.getFirst()));
            o.put("steps", s.getSecond());
            list.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("sources", list);
        String w = HealthSteps.wearableApp(getContext());
        if (w != null) {
            JSObject o = new JSObject();
            o.put("pkg", w);
            o.put("label", appLabel(w));
            ret.put("wearable", o);
        }
        call.resolve(ret);
    }

    // ------------------------------------------------------------------
    // Water from Kropi
    // ------------------------------------------------------------------

    @PluginMethod
    public void kropiStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("installed", Kropi.installed(getContext()));
        ret.put("granted", Kropi.granted(getContext()));
        call.resolve(ret);
    }

    /** Kropi's days, today first: { days: [{date, ml, goal}] }. */
    @PluginMethod
    public void kropiDays(PluginCall call) {
        JSArray list = new JSArray();
        for (Kropi.Day d : Kropi.days(getContext())) {
            JSObject o = new JSObject();
            o.put("date", d.date);
            o.put("ml", d.ml);
            o.put("goal", d.goal);
            list.put(o);
        }
        JSObject ret = new JSObject();
        ret.put("days", list);
        call.resolve(ret);
    }

    /** Opens Kropi's quick add (adds a glass there; Kropi reports back). */
    @PluginMethod
    public void kropiAdd(PluginCall call) {
        if (Kropi.quickAdd(getContext())) call.resolve();
        else call.reject("Kropi not installed");
    }

    /** Opens another app by package (e.g. Mi Fitness, so the band syncs its steps). */
    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("pkg", "");
        Intent i = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (i == null) {
            call.reject("not installed");
            return;
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(i);
        call.resolve();
    }

    private String appLabel(String pkg) {
        try {
            android.content.pm.PackageManager pm = getContext().getPackageManager();
            return pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (Exception e) {
            return pkg;
        }
    }

    // ------------------------------------------------------------------
    // The phone's calendars (READ_CALENDAR, CalendarBusy)
    // ------------------------------------------------------------------

    private JSObject calendarState() {
        JSObject ret = new JSObject();
        ret.put("granted", CalendarBusy.granted(getContext()));
        return ret;
    }

    @PluginMethod
    public void calendarStatus(PluginCall call) {
        call.resolve(calendarState());
    }

    /** The system "allow access to your calendar" dialog; resolves { granted }. */
    @PluginMethod
    public void requestCalendar(PluginCall call) {
        if (CalendarBusy.granted(getContext())) {
            call.resolve(calendarState());
            return;
        }
        requestPermissionForAlias("calendar", call, "onCalendarPermission");
    }

    @PermissionCallback
    private void onCalendarPermission(PluginCall call) {
        if (call == null) return;
        if (getPermissionState("calendar") == PermissionState.GRANTED) WidgetShared.updateAll(getContext());
        call.resolve(calendarState());
    }

    /** Every calendar on the phone: { granted, calendars: [{id, name, accountName, accountType, color, visible}] }. */
    @PluginMethod
    public void calendarList(PluginCall call) {
        JSArray list = new JSArray();
        for (CalendarBusy.Cal k : CalendarBusy.calendars(getContext())) {
            JSObject o = new JSObject();
            o.put("id", k.id);
            o.put("name", k.name);
            o.put("accountName", k.accountName);
            o.put("accountType", k.accountType);
            o.put("color", k.color);
            o.put("visible", k.visible);
            list.put(o);
        }
        JSObject ret = calendarState();
        ret.put("calendars", list);
        call.resolve(ret);
    }

    /**
     * Instances of { ids } in [fromMs, toMs): { granted, events: [{begin, end, allDay,
     * availability, declined, calendarId, title}] } (titles only for the Settings summary).
     */
    @PluginMethod
    public void calendarEvents(PluginCall call) {
        java.util.List<String> ids = new java.util.ArrayList<>();
        JSArray a = call.getArray("ids", new JSArray());
        for (int i = 0; i < a.length(); i++) {
            String id = a.optString(i, "");
            if (!id.isEmpty()) ids.add(id);
        }
        long now = System.currentTimeMillis();
        long from = call.getLong("fromMs", now);
        long to = call.getLong("toMs", now + 86_400_000L);
        JSArray list = new JSArray();
        for (CalendarBusy.Instance in : CalendarBusy.instances(getContext(), ids, from, to)) {
            JSObject o = new JSObject();
            o.put("begin", in.begin);
            o.put("end", in.end);
            o.put("allDay", in.allDay);
            o.put("availability", in.availability);
            o.put("declined", in.declined);
            o.put("calendarId", in.calendarId);
            o.put("title", in.title);
            list.put(o);
        }
        JSObject ret = calendarState();
        ret.put("events", list);
        call.resolve(ret);
    }

    /** Opens the system calendar app (to add / sync a work account). */
    @PluginMethod
    public void openCalendarApp(PluginCall call) {
        Intent i = new Intent(Intent.ACTION_VIEW, calendarTimeUri());
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("no calendar app");
        }
    }

    private static Uri calendarTimeUri() {
        return android.provider.CalendarContract.CONTENT_URI.buildUpon().appendPath("time")
            .appendPath(String.valueOf(System.currentTimeMillis())).build();
    }

    // ------------------------------------------------------------------
    // Screen time (usage access)
    // ------------------------------------------------------------------

    @PluginMethod
    public void screenStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", ScreenTime.granted(getContext()));
        call.resolve(ret);
    }

    /**
     * "Postęp dnia" as a Live Update (Android 16+): { supported, allowed } - allowed = the
     * system lets this app promote live notifications (the user can turn it off per app).
     */
    @PluginMethod
    public void liveUpdatesStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("supported", Build.VERSION.SDK_INT >= 36);
        ret.put("allowed", HabitNotifier.canPromote(getContext()));
        call.resolve(ret);
    }

    /** The system screen that turns live notifications on / off for this app. */
    @PluginMethod
    public void openLiveUpdatesSettings(PluginCall call) {
        String pkg = getContext().getPackageName();
        Intent i = new Intent("android.settings.APP_NOTIFICATION_PROMOTION_SETTINGS");
        i.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
        } catch (Exception e) {
            // a ROM without that screen (e.g. a vendor skin): the app's notification settings
            Intent fallback = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            fallback.putExtra(Settings.EXTRA_APP_PACKAGE, pkg);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    /** Usage access can only be granted in system settings; open that screen. */
    @PluginMethod
    public void openUsageSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        i.setData(Uri.parse("package:" + getContext().getPackageName()));
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
        } catch (Exception e) {
            // Some ROMs reject the package Uri - fall back to the generic list.
            Intent fallback = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
            fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(fallback);
        }
        call.resolve();
    }

    /**
     * Foreground minutes of apps per local day ("Minuty z aplikacji"):
     * { packages?: string[] (missing/empty = every app), days } ->
     * { granted, days: [{ daysAgo, date, total, apps: { pkg: minutes } }] }.
     */
    @PluginMethod
    public void appMinutes(PluginCall call) {
        int days = Math.max(0, Math.min(13, call.getInt("days", 7)));
        java.util.Set<String> watched = null;
        com.getcapacitor.JSArray pk = call.getArray("packages");
        if (pk != null && pk.length() > 0) {
            watched = new java.util.HashSet<>();
            for (int i = 0; i < pk.length(); i++) {
                String s = pk.optString(i, "");
                if (!s.isEmpty()) watched.add(s);
            }
        }
        JSObject ret = new JSObject();
        JSArray out = new JSArray();
        java.util.List<java.util.Map<String, Integer>> per = null;
        try {
            per = AppMinutes.perDay(getContext(), watched, days);
        } catch (Exception ignored) {
        }
        ret.put("granted", per != null);
        for (int d = 0; per != null && d < per.size(); d++) {
            JSObject day = new JSObject();
            JSObject apps = new JSObject();
            int total = 0;
            for (java.util.Map.Entry<String, Integer> e : per.get(d).entrySet()) {
                apps.put(e.getKey(), e.getValue());
                total += e.getValue();
            }
            day.put("daysAgo", d);
            day.put("date", WidgetShared.dateKey(d));
            day.put("total", total);
            day.put("apps", apps);
            out.put(day);
        }
        ret.put("days", out);
        call.resolve(ret);
    }

    /**
     * Late-night screen minutes per habit day: { afterMin, days } ->
     * { nights: [{ daysAgo, minutes, closed }] } (minutes -1 = no access).
     */
    @PluginMethod
    public void lateScreen(PluginCall call) {
        int after = call.getInt("afterMin", 23 * 60 + 30);
        int days = Math.min(7, call.getInt("days", 7));
        JSArray nights = new JSArray();
        for (int d = 0; d <= days; d++) {
            JSObject n = new JSObject();
            n.put("daysAgo", d);
            n.put("minutes", ScreenTime.lateMinutes(getContext(), d, after));
            n.put("social", NightStats.socialMinutes(getContext(), d, after));
            n.put("closed", ScreenTime.windowClosed(d));
            nights.put(n);
        }
        JSObject ret = new JSObject();
        ret.put("nights", nights);
        call.resolve(ret);
    }
}
