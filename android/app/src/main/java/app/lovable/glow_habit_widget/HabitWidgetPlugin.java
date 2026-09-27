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

/**
 * Native helpers for the web app: widget/notification refresh and backups
 * (see src/lib/widget/bridge.ts and src/lib/backup.ts).
 */
@CapacitorPlugin(name = "HabitWidget")
public class HabitWidgetPlugin extends Plugin {
    @PluginMethod
    public void refresh(PluginCall call) {
        WidgetShared.updateAll(getContext());
        call.resolve();
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
            BackupStore.Saved saved = BackupStore.write(getContext(), name, text, mime);
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
        } catch (Exception e) {
            ret.put("hits", new JSObject());
        }
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
    // Health Connect steps
    // ------------------------------------------------------------------

    private JSObject stepsState() {
        JSObject ret = new JSObject();
        ret.put("available", HealthSteps.available(getContext()));
        ret.put("granted", HealthSteps.granted(getContext()));
        ret.put("background", HealthSteps.backgroundGranted(getContext()));
        return ret;
    }

    @PluginMethod
    public void stepsStatus(PluginCall call) {
        call.resolve(stepsState());
    }

    /** Opens Health Connect's permission screen; resolves with the new status. */
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

    @PluginMethod
    public void readSteps(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("steps", HealthSteps.today(getContext()));
        call.resolve(ret);
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
