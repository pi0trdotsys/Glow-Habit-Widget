package app.lovable.glow_habit_widget;

import android.content.Intent;
import android.net.Uri;
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
        String name = call.getString("name", "loop-kopia.json");
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
                send.putExtra(Intent.EXTRA_SUBJECT, "Loop - kopia zapasowa");
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, "Udostępnij kopię zapasową");
                chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(chooser);
            }
            JSObject ret = new JSObject();
            ret.put("location", saved.location);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Nie udało się zapisać kopii: " + e.getMessage());
        }
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
            n.put("closed", ScreenTime.windowClosed(d));
            nights.put(n);
        }
        JSObject ret = new JSObject();
        ret.put("nights", nights);
        call.resolve(ret);
    }
}
