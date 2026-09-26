package app.lovable.glow_habit_widget;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * Night guard ("Szpila czuwa"): a foreground service that runs only inside the
 * night window. Every {@link #POLL_MS} while the screen is on it checks the
 * foreground app via usage events; when a social media app opens, Szpila pops
 * up immediately (heads-up), then escalates every few minutes of staying in.
 * Stops itself when the window ends. See LiveGuard for the logic.
 */
public class LiveGuardService extends Service {
    static volatile boolean running;
    private static final long POLL_MS = 2_000;
    private static final long IDLE_POLL_MS = 6_000;
    static final String CH_GUARD = "loop_guard";
    static final String CH_LIVE = "loop_live";
    static final int ID_GUARD = 7501;
    static final int ID_LIVE = 7500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final LiveGuard.Tracker tracker = new LiveGuard.Tracker();
    private String foreground;
    private long lastQuery;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannels(this);
        Notification n = guardNotification();
        try {
            if (Build.VERSION.SDK_INT >= 34) {
                startForeground(ID_GUARD, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            } else {
                startForeground(ID_GUARD, n);
            }
        } catch (Exception e) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (!running) {
            running = true;
            // Look back far enough to know the app already open when the guard starts (e.g. at 00:00 mid-scroll).
            lastQuery = System.currentTimeMillis() - 30 * 60_000L;
            handler.post(poll);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        LiveBlock.hide(this);
        running = false;
        handler.removeCallbacks(poll);
        LiveGuard.scheduleStart(this);
        super.onDestroy();
    }

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            Context c = LiveGuardService.this;
            int now = WidgetShared.nowMinute();
            if (!LiveGuard.enabled(c) || !LiveGuard.inWindow(now, LiveGuard.from(c), LiveGuard.until(c))) {
                stopForeground(true);
                stopSelf();
                return;
            }
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) {
                tracker.reset(); // screen off = session over
                LiveBlock.hide(c);
                foreground = null;
                lastQuery = System.currentTimeMillis();
                handler.postDelayed(this, IDLE_POLL_MS);
                return;
            }
            try {
                check(c);
            } catch (Exception ignored) {
            }
            handler.postDelayed(this, POLL_MS);
        }
    };

    private void check(Context c) {
        long nowMs = System.currentTimeMillis();
        UsageStatsManager usm = (UsageStatsManager) getSystemService(USAGE_STATS_SERVICE);
        if (usm == null) return;
        UsageEvents events = usm.queryEvents(lastQuery - 1_000L, nowMs);
        UsageEvents.Event e = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            if (e.getEventType() == UsageEvents.Event.ACTIVITY_RESUMED) foreground = e.getPackageName();
        }
        lastQuery = nowMs;
        boolean watched = LiveGuard.watched(c, foreground);
        if (LiveBlock.isShown()) {
            // Left the app some other way (gesture home, recents): drop the block.
            if (!watched) LiveBlock.hide(c);
            else return;
        }
        int action = tracker.onForeground(foreground, watched, nowMs, LiveGuard.snoozeUntil(c));
        if (action == LiveGuard.ESCALATE && LiveGuard.shouldBlock(tracker.jabs) && LiveGuard.blockEnabled(c) && block(c, nowMs)) return;
        if (action != LiveGuard.NONE) jab(c, action, nowMs);
    }

    /** Full-screen block over the app (after BLOCK_AFTER jabs). False if it couldn't be shown. */
    private boolean block(Context c, long nowMs) {
        String[] app = LiveGuard.SOCIAL.get(foreground);
        String label = app != null ? app[1] : "social media";
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray("block")) : "";
        if (text.isEmpty()) text = "Dość. {m} minut na {app} o {time}. Odkładasz telefon.";
        int m = tracker.minutesIn(nowMs);
        String time = WidgetShared.fmtMinute(WidgetShared.nowMinute());
        text = LiveGuard.fill(text, label, m, time, 0);
        String sub = m + " min na " + label + " · " + time + " · po " + LiveGuard.BLOCK_AFTER + " szpilach czas na blokadę";
        int cat = SzpilaWidgetProvider.catDrawable(WidgetShared.state(c).optString("face"), 1);
        boolean ok = LiveBlock.show(c, "SZPILA  " + HabitNotifier.EMOJI_ANGRY, text, sub, cat, new LiveBlock.Listener() {
            @Override
            public void onSleep() {
                LiveGuard.countEvent(c, "slept");
                LiveBlock.goHome(c);
                tracker.reset();
            }

            @Override
            public void onHoldThrough() {
                LiveGuard.countEvent(c, "passes");
                LiveGuard.snooze(c, LiveGuard.ESCALATE_MIN);
            }
        });
        if (ok) {
            LiveGuard.countEvent(c, "blocks");
            NotificationManagerCompat.from(c).cancel(ID_LIVE);
        }
        return ok;
    }

    /** The pop-up. Lines come from the snapshot (src/lib/live.ts), per app. */
    private void jab(Context c, int action, long nowMs) {
        if (!canNotify(c)) return;
        String[] app = LiveGuard.SOCIAL.get(foreground);
        String key = app != null ? app[0] : "generic";
        String label = app != null ? app[1] : "social media";
        int count = action == LiveGuard.FIRST ? LiveGuard.countHit(c) : LiveGuard.hits(c).optInt(
            LiveGuard.habitDay(WidgetShared.nowMinute(), WidgetShared.today(), WidgetShared.dateKey(1)), 1);
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = "";
        if (lines != null) {
            JSONArray pool = action == LiveGuard.FIRST ? lines.optJSONArray(key) : lines.optJSONArray("escalate");
            if (pool == null || pool.length() == 0) pool = lines.optJSONArray("generic");
            text = WidgetShared.pick(pool);
        }
        if (text.isEmpty()) text = "Jest {time}, a ty na {app}? Odłóż telefon i idź spać.";
        text = LiveGuard.fill(text, label, tracker.minutesIn(nowMs), WidgetShared.fmtMinute(WidgetShared.nowMinute()), count);

        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent sleep = PendingIntent.getActivity(c, 7510, home, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent snooze = new Intent(c, NotifierReceiver.class).setAction(LiveGuard.ACTION_SNOOZE)
            .setData(Uri.parse("loop://live/snooze"));
        PendingIntent snoozePi = PendingIntent.getBroadcast(c, 7511, snooze, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle((action == LiveGuard.FIRST ? HabitNotifier.EMOJI_NORMAL : HabitNotifier.EMOJI_ANGRY) + " Szpila · " + label)
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setVibrate(new long[]{0, 180, 90, 180})
            .setAutoCancel(true)
            .setTimeoutAfter(90_000)
            .setContentIntent(sleep)
            .addAction(0, "😴 Idę spać", sleep)
            .addAction(0, "⏱ Jeszcze " + LiveGuard.ESCALATE_MIN + " min", snoozePi);
        try {
            NotificationManagerCompat.from(c).notify(ID_LIVE, b.build());
        } catch (SecurityException ignored) {
        }
    }

    private Notification guardNotification() {
        Set<String> labels = new LinkedHashSet<>();
        for (String pkg : LiveGuard.SOCIAL.keySet()) {
            if (LiveGuard.watched(this, pkg) && LiveGuard.installed(this, pkg)) labels.add(LiveGuard.SOCIAL.get(pkg)[1]);
        }
        List<String> list = new ArrayList<>(labels);
        String watching = list.isEmpty() ? "social media" : String.join(", ", list.subList(0, Math.min(4, list.size())))
            + (list.size() > 4 ? " i inne" : "");
        PendingIntent open = WidgetShared.openAppIntent(this, 7502);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_GUARD)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(HabitNotifier.EMOJI_NORMAL + " Szpila czuwa do " + WidgetShared.fmtMinute(LiveGuard.until(this)))
            .setContentText("Pilnuję: " + watching)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_MIN);
        if (open != null) b.setContentIntent(open);
        return b.build();
    }

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        if (nm.getNotificationChannel(CH_GUARD) == null) {
            NotificationChannel ch = new NotificationChannel(CH_GUARD, "Szpila czuwa (noc)", NotificationManager.IMPORTANCE_MIN);
            ch.setDescription("Ciche powiadomienie, gdy nocny strażnik social mediów jest aktywny");
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        if (nm.getNotificationChannel(CH_LIVE) == null) {
            NotificationChannel ch = new NotificationChannel(CH_LIVE, "Szpila na żywo", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Wyskakuje, gdy po północy otwierasz social media");
            ch.enableVibration(true);
            ch.setVibrationPattern(new long[]{0, 180, 90, 180});
            nm.createNotificationChannel(ch);
        }
    }

    private static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }
}
