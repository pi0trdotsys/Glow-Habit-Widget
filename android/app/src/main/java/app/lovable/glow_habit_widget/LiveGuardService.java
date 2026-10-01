package app.lovable.glow_habit_widget;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
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
import java.util.Calendar;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * "Szpila czuwa": one foreground service for every guard phase (DayGuard.phase):
 * - NIGHT (bedtime .. 05:00): a jab the moment a social media app opens, harsher
 *   every few minutes, the full-screen block after the 3rd jab (2nd before the
 *   deadline); with the curfew on, after the deadline every app outside the
 *   allow list is blocked at once (urgent passes: a growing hold, 3 min, a
 *   dark veil, a cost in tomorrow's limit); the charger is noticed too;
 * - MORNING (05:00 .. e.g. 11:00, while morning habits are pending): social media
 *   is blocked right away - tick the habits off from the block or hold 10 s;
 * - DAY: counts today's social media minutes; past the daily limit it jabs and
 *   blocks like at night (also a shopping-only DAY phase at any hour, see below);
 * - in every phase, with "24 h do namysłu" on (ShopGuard): a shopping app is
 *   covered at once - write the thing on the wishlist, leave, or hold 20 s for
 *   a short pass.
 * Polls the foreground app every POLL_MS only while the screen is on (a
 * screen-on receiver wakes it up); stops itself when no phase is active.
 */
public class LiveGuardService extends Service {
    static volatile boolean running;
    private static final long POLL_MS = 2_000;
    private static final long DAY_POLL_MS = 4_000;
    /** Re-read the snapshot (settings, morning habits) at most this often. */
    private static final long CONFIG_MS = 10_000;
    private static final long SAVE_MS = 30_000;
    static final String CH_GUARD = "loop_guard";
    static final String CH_LIVE = "loop_live";
    static final int ID_GUARD = 7501;
    static final int ID_LIVE = 7500;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final LiveGuard.Tracker tracker = new LiveGuard.Tracker();
    private String foreground;
    private long lastQuery;
    private long lastPoll;
    private int phase = DayGuard.OFF;
    private long configAt;
    private long usedMs;
    private long savedAt;
    private String usedDay = "";
    private String notifKey = "";
    private boolean polling;
    private java.util.Set<String> essential;
    private long essentialAt;
    private long unplugJabAt;
    /** Settings the phase depends on (refreshed with the phase). */
    private DayGuard.Config cfg = new DayGuard.Config();
    /** The block on screen is the shopping one (it stays only over a shopping app). */
    private boolean shopShown;
    /** Shopping app already noted this visit (no overlay permission: one notification per visit). */
    private String shopNoted;

    private final BroadcastReceiver screen = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            if (Intent.ACTION_SCREEN_ON.equals(intent.getAction())) {
                lastQuery = System.currentTimeMillis() - 5_000L;
                lastPoll = 0;
                schedulePoll(0);
            } else {
                // screen off = session over; nothing to watch until it's back on
                tracker.reset();
                LiveBlock.hide(LiveGuardService.this);
                LiveDim.hide(LiveGuardService.this);
                foreground = null;
                saveUsed(true);
            }
        }
    };

    /** Phone on the charger at night = put down (noted for the bill); unplugged after the deadline = a jab. */
    private final BroadcastReceiver power = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            Context c = LiveGuardService.this;
            if (DayGuard.phase(c) != DayGuard.NIGHT) return;
            if (Intent.ACTION_POWER_CONNECTED.equals(intent.getAction())) {
                if (LiveGuard.markCharged(c)) chargerNote(c);
            } else if (Intent.ACTION_POWER_DISCONNECTED.equals(intent.getAction())) {
                int now = WidgetShared.nowMinute();
                long ms = System.currentTimeMillis();
                if (LiveGuard.curfewNow(now, LiveGuard.from(c), LiveGuard.until(c)) && ms - unplugJabAt > 10 * 60_000L) {
                    unplugJabAt = ms;
                    LiveGuard.countEvent(c, "unplugs");
                    unplugJab(c);
                }
            }
        }
    };

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        ensureChannels(this);
        phase = DayGuard.phase(this);
        cfg = DayGuard.config(this);
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
            seedUsed();
            IntentFilter f = new IntentFilter(Intent.ACTION_SCREEN_ON);
            f.addAction(Intent.ACTION_SCREEN_OFF);
            androidx.core.content.ContextCompat.registerReceiver(this, screen, f, androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
            IntentFilter pf = new IntentFilter(Intent.ACTION_POWER_CONNECTED);
            pf.addAction(Intent.ACTION_POWER_DISCONNECTED);
            androidx.core.content.ContextCompat.registerReceiver(this, power, pf, androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED);
            // Already on the charger when the night starts: that's when it went down.
            if (phase == DayGuard.NIGHT && charging()) LiveGuard.markCharged(this);
            schedulePoll(0);
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        LiveBlock.hide(this);
        LiveDim.hide(this);
        running = false;
        handler.removeCallbacks(poll);
        try {
            unregisterReceiver(screen);
        } catch (Exception ignored) {
        }
        try {
            unregisterReceiver(power);
        } catch (Exception ignored) {
        }
        saveUsed(true);
        LiveGuard.scheduleStart(this);
        super.onDestroy();
    }

    private void schedulePoll(long delay) {
        handler.removeCallbacks(poll);
        polling = true;
        handler.postDelayed(poll, delay);
    }

    private final Runnable poll = new Runnable() {
        @Override
        public void run() {
            polling = false;
            Context c = LiveGuardService.this;
            long nowMs = System.currentTimeMillis();
            if (nowMs - configAt > CONFIG_MS) {
                configAt = nowMs;
                int p = DayGuard.phase(c);
                cfg = DayGuard.config(c);
                if (p == DayGuard.OFF) {
                    stopForeground(true);
                    stopSelf();
                    return;
                }
                if (p != phase) {
                    phase = p;
                    tracker.reset();
                    LiveBlock.hide(c);
                }
                refreshNotification();
            }
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null && !pm.isInteractive()) return; // the screen-on receiver resumes polling
            try {
                check(c, nowMs);
            } catch (Exception ignored) {
            }
            schedulePoll(phase == DayGuard.DAY ? DAY_POLL_MS : POLL_MS);
        }
    };

    // ------------------------------------------------------------------ today's minutes

    private long dayStartMs() {
        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, DayGuard.DAY_START / 60);
        cal.set(Calendar.MINUTE, DayGuard.DAY_START % 60);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);
        return cal.getTimeInMillis();
    }

    /** Today's minutes so far: what we counted, or the usage history if that says more. */
    private void seedUsed() {
        usedDay = WidgetShared.today();
        long now = System.currentTimeMillis();
        long from = dayStartMs();
        long history = now > from ? NightStats.socialMsBetween(this, from, now) : 0;
        usedMs = Math.max(DayGuard.usedMs(this), history);
        DayGuard.setUsedMs(this, usedMs);
        savedAt = now;
    }

    private void saveUsed(boolean force) {
        long now = System.currentTimeMillis();
        if (force || now - savedAt > SAVE_MS) {
            DayGuard.setUsedMs(this, usedMs);
            savedAt = now;
        }
    }

    // ------------------------------------------------------------------ the check

    private void check(Context c, long nowMs) {
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
        int nowMin = WidgetShared.nowMinute();
        boolean night = phase == DayGuard.NIGHT;
        boolean pre = night && LiveGuard.prePhase(nowMin, LiveGuard.start(c), LiveGuard.from(c));
        // Curfew: after the deadline every app outside the allow list is off limits.
        boolean curfewHit = night && !pre && LiveGuard.curfewOn(c)
            && LiveGuard.curfewNow(nowMin, LiveGuard.from(c), LiveGuard.until(c))
            && LiveGuard.curfewBlocks(foreground, essential(c, nowMs), LiveGuard.curfewAllowed(c));
        long passUntil = curfewHit ? LiveGuard.curfewPassUntil(c) : 0;
        boolean passing = curfewHit && nowMs < passUntil;
        long passMs = LiveGuard.CURFEW_PASS_MIN * 60_000L;
        if (passing && LiveGuard.curfewDim(c)) LiveDim.set(c, LiveGuard.dimAlpha(nowMs - (passUntil - passMs), passMs));
        else LiveDim.hide(c);
        // "24 h do namysłu": a shopping app (any phase; the curfew block wins after the deadline).
        boolean shopHit = !curfewHit && ShopGuard.blocks(foreground, cfg.shop, ShopGuard.off(c), nowMs, ShopGuard.passUntil(c));

        // The day count runs outside the night (05:00 .. bedtime) while the morning lock or the limit is on.
        if (!usedDay.equals(WidgetShared.today())) seedUsed();
        if (DayGuard.countsSocial(phase, cfg, nowMin)) {
            usedMs += DayGuard.tickMs(lastPoll, nowMs, watched, 10_000L);
            saveUsed(false);
        }
        lastPoll = nowMs;

        if (LiveBlock.isShown()) {
            // Left the app some other way (gesture home, recents): drop the block.
            if (shopShown ? !shopHit : (!watched && !curfewHit)) LiveBlock.hide(c);
            return;
        }
        shopShown = false;
        if (passing) return; // an urgent pass: quiet until it runs out
        if (curfewHit) {
            if (LiveGuard.blockEnabled(c) && curfewBlock(c)) return;
            watched = true; // no overlay permission: jab like for social media
        }
        if (shopHit) {
            if (shopBlock(c)) return;
            // No overlay permission: one note per visit.
            if (!foreground.equals(shopNoted)) {
                shopNoted = foreground;
                shopNote(c, "shop", HabitNotifier.EMOJI_ANGRY, "{app}? Dopisz to do listy w Szpili i wróć za 24 h.",
                    "{app}? Write it on the list in Szpila and come back in 24 h.", 60_000L, true);
            }
            return;
        }
        if (!ShopGuard.isShop(foreground)) shopNoted = null;
        if (phase == DayGuard.MORNING) {
            morning(c, watched, nowMs);
            return;
        }
        if (phase == DayGuard.DAY) {
            if (!DayGuard.limitActive(cfg, nowMin)) {
                tracker.reset(); // only the shopping guard runs now
                return;
            }
            int state = DayGuard.limitState((int) (usedMs / 60_000L), DayGuard.limit(c));
            if (state == DayGuard.LIMIT_WARN && watched && DayGuard.onceToday(c, "day_warn")) warn(c);
            if (state != DayGuard.LIMIT_OVER) {
                tracker.reset();
                return;
            }
        }
        int action = tracker.onForeground(foreground, watched, nowMs, LiveGuard.snoozeUntil(c));
        if (action == LiveGuard.ESCALATE && LiveGuard.shouldBlock(tracker.jabs, pre) && LiveGuard.blockEnabled(c) && block(c, nowMs)) return;
        if (action != LiveGuard.NONE) jab(c, action, nowMs);
    }

    /** Apps the curfew never blocks (home, dialer, clock, keyboard...), resolved every 10 min. */
    private java.util.Set<String> essential(Context c, long nowMs) {
        if (essential == null || nowMs - essentialAt > 10 * 60_000L) {
            essential = LiveGuard.essentialApps(c);
            essentialAt = nowMs;
        }
        return essential;
    }

    private boolean charging() {
        Intent b = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        int plugged = b != null ? b.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0) : 0;
        return plugged != 0;
    }

    // ------------------------------------------------------------------ curfew

    /** The curfew block: straight away, over any app outside the allow list. */
    private boolean curfewBlock(Context c) {
        boolean en = WidgetShared.en(c);
        String label = LiveGuard.appLabel(c, foreground);
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray("curfew")) : "";
        if (text.isEmpty()) {
            text = en ? "It's {time}. Curfew: the phone sleeps, and so do you." : "Jest {time}. Cisza nocna: telefon śpi, ty też.";
        }
        int now = WidgetShared.nowMinute();
        int until = LiveGuard.until(c);
        int passes = LiveGuard.tonight(c, "curfew_passes");
        text = curfewFill(text, label, now, until, passes);
        int allowed = LiveGuard.curfewAllowed(c).size();
        String sub = en
            ? "Curfew until " + WidgetShared.fmtMinute(until) + " · allowed: alarm, calls" + (allowed > 0 ? " + " + allowed + " apps" : "")
                + (passes > 0 ? " · urgent passes tonight: " + passes : "")
            : "Cisza nocna do " + WidgetShared.fmtMinute(until) + " · działa: budzik, telefon" + (allowed > 0 ? " + " + allowed + " apl." : "")
                + (passes > 0 ? " · wyjątki tej nocy: " + passes : "");
        long hold = LiveGuard.curfewHoldMs(passes);
        String idle = en
            ? "Urgent? Hold " + hold / 1000 + " s for " + LiveGuard.CURFEW_PASS_MIN + " min (costs 10 min of tomorrow's limit)"
            : "Pilne? Przytrzymaj " + hold / 1000 + " s na " + LiveGuard.CURFEW_PASS_MIN + " min (kosztuje 10 min jutrzejszego limitu)";
        List<String[]> actions = new ArrayList<>();
        actions.add(new String[]{"alarm", en ? "⏰  Set the alarm" : "⏰  Ustaw budzik"});
        int cat = SzpilaWidgetProvider.catDrawable(WidgetShared.state(c).optString("face"), 1);
        boolean ok = LiveBlock.show(c, "SZPILA  🌙", text, sub, cat, en ? "😴  Going to sleep" : "😴  Idę spać", actions, hold, idle,
            new LiveBlock.Listener() {
                @Override
                public void onSleep() {
                    LiveGuard.countEvent(c, "curfew_slept");
                    LiveBlock.goHome(c);
                    tracker.reset();
                }

                @Override
                public void onHoldThrough() {
                    LiveGuard.countEvent(c, "curfew_passes");
                    LiveGuard.curfewPass(c, System.currentTimeMillis() + LiveGuard.CURFEW_PASS_MIN * 60_000L);
                    passNote(c);
                }

                @Override
                public void onAction(String id) {
                    LiveBlock.hide(c);
                    try {
                        c.startActivity(new Intent(android.provider.AlarmClock.ACTION_SHOW_ALARMS)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    } catch (Exception e) {
                        LiveBlock.goHome(c);
                    }
                }
            });
        if (ok) {
            LiveGuard.countEvent(c, "curfew_blocks");
            NotificationManagerCompat.from(c).cancel(ID_LIVE);
        }
        return ok;
    }

    /** {app} {time} {count} (passes tonight) {until} (morning) {left} (minutes to the morning). */
    static String curfewFill(String line, String app, int now, int until, int passes) {
        return LiveGuard.fill(line, app, 0, WidgetShared.fmtMinute(now), passes)
            .replace("{until}", WidgetShared.fmtMinute(until))
            .replace("{left}", String.valueOf(LiveGuard.minutesTo(now, until)));
    }

    private void passNote(Context c) {
        quickNote(c, "pass", HabitNotifier.EMOJI_ANGRY,
            "{count}. wyjątek tej nocy. Masz " + LiveGuard.CURFEW_PASS_MIN + " minuty, a ekran będzie ciemniał.",
            "Urgent pass no. {count} tonight. You've got " + LiveGuard.CURFEW_PASS_MIN + " minutes and the screen will darken.", 30_000L, false);
    }

    private void chargerNote(Context c) {
        quickNote(c, "charger", HabitNotifier.EMOJI_IMPRESSED,
            "Telefon na ładowarce o {time}. Tak trzymaj - niech tam zostanie do rana.",
            "Phone on the charger at {time}. Good - let it stay there till morning.", 20_000L, false);
    }

    private void unplugJab(Context c) {
        quickNote(c, "unplug", HabitNotifier.EMOJI_ANGRY,
            "Odłączasz telefon o {time}? Widzę to. Z powrotem na ładowarkę i spać.",
            "Unplugging the phone at {time}? I saw that. Back on the charger and go to sleep.", 60_000L, true);
    }

    /** A short Szpila note from a snapshot pool (fallback texts inline). */
    private void quickNote(Context c, String pool, String emoji, String pl, String en, long timeout, boolean loud) {
        if (!canNotify(c)) return;
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray(pool)) : "";
        if (text.isEmpty()) text = WidgetShared.tr(c, pl, en);
        int now = WidgetShared.nowMinute();
        text = curfewFill(text, "", now, LiveGuard.until(c), LiveGuard.tonight(c, "curfew_passes"));
        note(c, emoji, text, timeout, loud);
    }

    /** A short Szpila notification (silent unless `loud`). */
    private void note(Context c, String emoji, String text, long timeout, boolean loud) {
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(emoji + " Szpila")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setAutoCancel(true)
            .setTimeoutAfter(timeout);
        if (loud) b.setPriority(NotificationCompat.PRIORITY_HIGH).setVibrate(new long[]{0, 180, 90, 180});
        else b.setSilent(true);
        try {
            NotificationManagerCompat.from(c).notify(ID_LIVE, b.build());
        } catch (SecurityException ignored) {
        }
    }

    // ------------------------------------------------------------------ shopping: 24 h do namysłu

    /** The shopping block: straight away, over a watched shopping app (no pass active). */
    private boolean shopBlock(Context c) {
        boolean en = WidgetShared.en(c);
        String pkg = foreground;
        String label = ShopGuard.label(pkg);
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray("shop")) : "";
        if (text.isEmpty()) {
            text = en ? "{app} at {time}? Write it on the list and decide in 24 hours."
                : "{app} o {time}? Dopisz to do listy i zdecyduj za 24 h.";
        }
        int passMin = ShopGuard.passMin(c);
        String time = WidgetShared.fmtMinute(WidgetShared.nowMinute());
        text = ShopGuard.fill(text, label, time, ShopGuard.today(c, "shop_blocks") + 1, passMin);
        JSONObject s = ShopGuard.settings(c);
        String sub = ShopGuard.sub(en, s.optInt("waiting"), s.optInt("ready"), s.optInt("saved"), s.optInt("savedMoney"));
        String idle = en
            ? "Must buy it right now? Hold " + ShopGuard.HOLD_MS / 1000 + " s for " + passMin + " min"
            : "Konieczny zakup? Przytrzymaj " + ShopGuard.HOLD_MS / 1000 + " s na " + passMin + " min";
        List<String[]> actions = new ArrayList<>();
        actions.add(new String[]{"wish", en ? "🛒  Add to the list (24 h)" : "🛒  Dopisz do listy (24 h)"});
        int cat = SzpilaWidgetProvider.catDrawable(WidgetShared.state(c).optString("face"), 1);
        boolean ok = LiveBlock.show(c, "SZPILA  🛒", text, sub, cat, en ? "🏃  I'm leaving" : "🏃  Wychodzę", actions,
            ShopGuard.HOLD_MS, idle, new LiveBlock.Listener() {
                @Override
                public void onSleep() {
                    ShopGuard.countDay(c, "shop_left");
                    LiveBlock.goHome(c);
                }

                @Override
                public void onHoldThrough() {
                    ShopGuard.countDay(c, "shop_passes");
                    ShopGuard.pass(c, passMin);
                    shopNote(c, "shopPass", HabitNotifier.EMOJI_ANGRY,
                        "Dobra, {min} min na konieczny zakup. Tylko to, po co tu wchodzisz.",
                        "Fine, {min} min for a must-buy. Only what you came here for.", 60_000L, false, label, passMin);
                }

                @Override
                public void onAction(String id) {
                    ShopGuard.countDay(c, "shop_wish");
                    // Szpila opens on the wishlist (src/routes/wishlist.tsx reads the route on start/resume).
                    ShopGuard.setPendingRoute(c, "/wishlist?add=1&app=" + pkg);
                    if (!openSzpila(c)) LiveBlock.goHome(c);
                    LiveBlock.hide(c);
                }
            });
        if (ok) {
            ShopGuard.countDay(c, "shop_blocks");
            shopShown = true;
            NotificationManagerCompat.from(c).cancel(ID_LIVE);
        }
        return ok;
    }

    /** Bring Szpila to the front (allowed from the background while our overlay is visible). */
    private static boolean openSzpila(Context c) {
        try {
            Intent i = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (i == null) return false;
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            c.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void shopNote(Context c, String pool, String emoji, String pl, String en, long timeout, boolean loud) {
        shopNote(c, pool, emoji, pl, en, timeout, loud, ShopGuard.label(foreground), ShopGuard.passMin(c));
    }

    /** A shopping note from a snapshot pool: {app} {time} {count} {min}. */
    private void shopNote(Context c, String pool, String emoji, String pl, String en, long timeout, boolean loud,
                          String label, int passMin) {
        if (!canNotify(c)) return;
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray(pool)) : "";
        if (text.isEmpty()) text = WidgetShared.tr(c, pl, en);
        text = ShopGuard.fill(text, label != null ? label : "", WidgetShared.fmtMinute(WidgetShared.nowMinute()),
            ShopGuard.today(c, "shop_blocks"), passMin);
        note(c, emoji, text, timeout, loud);
    }

    // ------------------------------------------------------------------ morning lock

    private void morning(Context c, boolean watched, long nowMs) {
        if (!watched || nowMs < LiveGuard.snoozeUntil(c)) return;
        List<JSONObject> pending = DayGuard.morningPending(c);
        if (pending.isEmpty()) {
            configAt = 0; // done - re-evaluate the phase on the next poll
            return;
        }
        if (LiveGuard.blockEnabled(c)) {
            if (morningBlock(c, pending)) return;
        }
        // No overlay permission: at least one jab per visit.
        if (tracker.onForeground(foreground, true, nowMs, 0) == LiveGuard.FIRST) jab(c, LiveGuard.FIRST, nowMs);
    }

    private boolean morningBlock(Context c, List<JSONObject> pending) {
        boolean en = WidgetShared.en(c);
        String[] app = LiveGuard.SOCIAL.get(foreground);
        String label = app != null ? app[1] : "social media";
        String tasks = DayGuard.names(pending);
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray("morning")) : "";
        if (text.isEmpty()) {
            text = en ? "First {tasks}. Then {app}." : "Najpierw {tasks}. Potem {app}.";
        }
        text = text.replace("{tasks}", tasks).replace("{app}", label);
        int until = DayGuard.morningSettings(c).optInt("until", 11 * 60);
        String sub = en ? "Mornings: habits first · until " + WidgetShared.fmtMinute(until)
            : "Rano najpierw zadania · do " + WidgetShared.fmtMinute(until);
        List<String[]> actions = new ArrayList<>();
        for (JSONObject h : pending) actions.add(new String[]{h.optString("id"), "✓ " + h.optString("name")});
        int cat = SzpilaWidgetProvider.catDrawable(WidgetShared.state(c).optString("face"), 1);
        boolean ok = LiveBlock.show(c, "SZPILA  " + HabitNotifier.EMOJI_ANGRY, text, sub, cat,
            en ? "🏃  Going to do it" : "🏃  Idę to zrobić", actions, new LiveBlock.Listener() {
                @Override
                public void onSleep() {
                    LiveBlock.goHome(c);
                    tracker.reset();
                }

                @Override
                public void onHoldThrough() {
                    LiveGuard.countEvent(c, "morning_passes");
                    LiveGuard.snooze(c, DayGuard.MORNING_PASS_MIN);
                }

                @Override
                public void onAction(String id) {
                    WidgetShared.applyTap(c, id, true);
                    WidgetShared.updateAll(c);
                    LiveBlock.hide(c);
                    List<JSONObject> left = DayGuard.morningPending(c);
                    if (left.isEmpty()) {
                        configAt = 0;
                        unlocked(c);
                    } else {
                        morningBlock(c, left); // the rest of the list
                    }
                }
            });
        if (ok) LiveGuard.countEvent(c, "morning_blocks");
        return ok;
    }

    /** All morning habits done: a short "you're free" note. */
    private void unlocked(Context c) {
        if (!canNotify(c)) return;
        boolean en = WidgetShared.en(c);
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray("morningDone")) : "";
        if (text.isEmpty()) text = en ? "Done. Social media unlocked." : "Zrobione. Social media odblokowane.";
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(HabitNotifier.EMOJI_IMPRESSED + " Szpila")
            .setContentText(text)
            .setSilent(true)
            .setAutoCancel(true)
            .setTimeoutAfter(20_000);
        try {
            NotificationManagerCompat.from(c).notify(ID_LIVE, b.build());
        } catch (SecurityException ignored) {
        }
    }

    // ------------------------------------------------------------------ block + jabs (night / over the limit)

    /** Full-screen block over the app (after BLOCK_AFTER jabs). False if it couldn't be shown. */
    private boolean block(Context c, long nowMs) {
        String[] app = LiveGuard.SOCIAL.get(foreground);
        String label = app != null ? app[1] : "social media";
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        boolean day = phase == DayGuard.DAY;
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray(day ? "dayBlock" : "block")) : "";
        boolean en = WidgetShared.en(c);
        if (text.isEmpty()) {
            text = en ? "Enough. {m} minutes on {app} at {time}. Phone down."
                : "Dość. {m} minut na {app} o {time}. Odkładasz telefon.";
        }
        int m = tracker.minutesIn(nowMs);
        String time = WidgetShared.fmtMinute(WidgetShared.nowMinute());
        text = fillDay(LiveGuard.fill(text, label, m, time, 0), c);
        String sub;
        if (day) {
            sub = en ? "Social media today: " + usedMin() + "/" + DayGuard.limit(c) + " min"
                : "Social media dziś: " + usedMin() + "/" + DayGuard.limit(c) + " min";
        } else {
            sub = en
                ? m + " min on " + label + " · " + time + " · after " + LiveGuard.BLOCK_AFTER + " jabs it's block time"
                : m + " min na " + label + " · " + time + " · po " + LiveGuard.BLOCK_AFTER + " szpilach czas na blokadę";
        }
        int cat = SzpilaWidgetProvider.catDrawable(WidgetShared.state(c).optString("face"), 1);
        String out = day ? (en ? "📵  Enough for today" : "📵  Na dziś wystarczy") : null;
        boolean ok = LiveBlock.show(c, "SZPILA  " + HabitNotifier.EMOJI_ANGRY, text, sub, cat, out, null, new LiveBlock.Listener() {
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
            LiveGuard.countEvent(c, day ? "day_blocks" : "blocks");
            NotificationManagerCompat.from(c).cancel(ID_LIVE);
        }
        return ok;
    }

    private int usedMin() {
        return (int) (usedMs / 60_000L);
    }

    /** {used} {limit} {over} for the daily-limit lines. */
    private String fillDay(String line, Context c) {
        int limit = DayGuard.limit(c);
        return line.replace("{used}", String.valueOf(usedMin())).replace("{limit}", String.valueOf(limit))
            .replace("{over}", String.valueOf(Math.max(0, usedMin() - limit)))
            .replace("{left}", String.valueOf(Math.max(0, limit - usedMin())));
    }

    /** The pop-up. Lines come from the snapshot (src/lib/live.ts), per app. */
    private void jab(Context c, int action, long nowMs) {
        if (!canNotify(c)) return;
        String[] app = LiveGuard.SOCIAL.get(foreground);
        String key = app != null ? app[0] : "generic";
        String label = app != null ? app[1] : foreground != null ? LiveGuard.appLabel(c, foreground) : "social media";
        boolean day = phase == DayGuard.DAY;
        boolean morning = phase == DayGuard.MORNING;
        int count = action == LiveGuard.FIRST && !day && !morning ? LiveGuard.countHit(c) : LiveGuard.hits(c).optInt(
            LiveGuard.habitDay(WidgetShared.nowMinute(), WidgetShared.today(), WidgetShared.dateKey(1)), 1);
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        // Before the deadline (bedtime mode): countdown lines instead of the after-midnight ones.
        boolean pre = !day && !morning && LiveGuard.prePhase(WidgetShared.nowMinute(), LiveGuard.start(c), LiveGuard.from(c));
        String text = "";
        if (lines != null) {
            JSONArray pool = morning ? lines.optJSONArray("morning")
                : day ? lines.optJSONArray(action == LiveGuard.FIRST ? "dayOver" : "dayEscalate")
                : pre ? lines.optJSONArray("pre")
                : action == LiveGuard.FIRST ? lines.optJSONArray(key) : lines.optJSONArray("escalate");
            if (pool == null || pool.length() == 0) pool = lines.optJSONArray("generic");
            text = WidgetShared.pick(pool);
        }
        boolean en = WidgetShared.en(c);
        if (text.isEmpty()) {
            text = en ? "It's {time} and you're on {app}? Put the phone down."
                : "Jest {time}, a ty na {app}? Odłóż telefon.";
        }
        text = LiveGuard.fill(text, label, tracker.minutesIn(nowMs), WidgetShared.fmtMinute(WidgetShared.nowMinute()), count);
        text = LiveGuard.fillLeft(text, LiveGuard.minutesTo(WidgetShared.nowMinute(), LiveGuard.from(c)), WidgetShared.fmtMinute(LiveGuard.from(c)));
        text = fillDay(text, c).replace("{tasks}", DayGuard.names(DayGuard.morningPending(c)));

        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        PendingIntent sleep = PendingIntent.getActivity(c, 7510, home, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent snooze = new Intent(c, NotifierReceiver.class).setAction(LiveGuard.ACTION_SNOOZE)
            .setData(Uri.parse("loop://live/snooze"));
        PendingIntent snoozePi = PendingIntent.getBroadcast(c, 7511, snooze, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String out = day || morning ? (en ? "📵 Close it" : "📵 Zamykam") : (en ? "😴 Going to bed" : "😴 Idę spać");

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
            .addAction(0, out, sleep);
        if (!morning) b.addAction(0, en ? "⏱ " + LiveGuard.ESCALATE_MIN + " more min" : "⏱ Jeszcze " + LiveGuard.ESCALATE_MIN + " min", snoozePi);
        try {
            NotificationManagerCompat.from(c).notify(ID_LIVE, b.build());
        } catch (SecurityException ignored) {
        }
    }

    /** Once a day, 10 min before the limit. */
    private void warn(Context c) {
        if (!canNotify(c)) return;
        boolean en = WidgetShared.en(c);
        JSONObject lines = LiveGuard.settings(c).optJSONObject("lines");
        String text = lines != null ? WidgetShared.pick(lines.optJSONArray("dayWarn")) : "";
        if (text.isEmpty()) text = en ? "{left} min of social media left today." : "Zostało {left} min social mediów na dziś.";
        text = fillDay(text, c);
        NotificationCompat.Builder b = new NotificationCompat.Builder(c, CH_LIVE)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(HabitNotifier.EMOJI_NORMAL + " Szpila")
            .setContentText(text)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(text))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setTimeoutAfter(60_000);
        try {
            NotificationManagerCompat.from(c).notify(ID_LIVE, b.build());
        } catch (SecurityException ignored) {
        }
    }

    // ------------------------------------------------------------------ the ongoing notification

    private void refreshNotification() {
        String key = phase + "|" + shopOnly() + "|" + usedMin() + "|" + DayGuard.limit(this) + "|" + curfewNow(this) + "|"
            + (phase == DayGuard.MORNING ? DayGuard.names(DayGuard.morningPending(this)) : "");
        if (key.equals(notifKey)) return;
        notifKey = key;
        try {
            NotificationManagerCompat.from(this).notify(ID_GUARD, guardNotification());
        } catch (SecurityException ignored) {
        }
    }

    /** Curfew on and past the deadline right now. */
    private static boolean curfewNow(Context c) {
        return LiveGuard.curfewOn(c) && DayGuard.phase(c) == DayGuard.NIGHT
            && LiveGuard.curfewNow(WidgetShared.nowMinute(), LiveGuard.from(c), LiveGuard.until(c));
    }

    /** Title + text of the ongoing notification per phase (pure, for tests). */
    static String[] guardText(int phase, boolean en, int until, String watching, String pendingNames, int used, int limit) {
        return guardText(phase, en, until, watching, pendingNames, used, limit, false, 0);
    }

    /** Same, with the curfew (after the deadline): what still works. */
    static String[] guardText(int phase, boolean en, int until, String watching, String pendingNames, int used, int limit,
                              boolean curfew, int allowedApps) {
        if (phase == DayGuard.NIGHT && curfew) {
            String extra = allowedApps > 0 ? (en ? " + " + allowedApps + " allowed apps" : " + " + allowedApps + " dozwolone apl.") : "";
            return new String[]{
                "🌙 " + (en ? "Curfew until " : "Cisza nocna do ") + WidgetShared.fmtMinute(until),
                (en ? "Only the alarm, calls" : "Działa tylko budzik, telefon") + extra
                    + (en ? ". Everything else: blocked." : ". Reszta: blokada.")};
        }
        if (phase == DayGuard.MORNING) {
            return new String[]{
                "🔒 " + (en ? "Mornings: habits first" : "Rano najpierw zadania"),
                (en ? "Left: " : "Zostało: ") + pendingNames + (en ? " · social media locked until " : " · social media zablokowane do ")
                    + WidgetShared.fmtMinute(until)};
        }
        if (phase == DayGuard.DAY) {
            String title = "📱 " + (en ? "Social media today: " : "Social media dziś: ") + used + "/" + limit + " min";
            String text = used >= limit
                ? (en ? "Over the limit by " + (used - limit) + " min - Szpila is jabbing." : "Limit przekroczony o " + (used - limit) + " min - Szpila szpiluje.")
                : (en ? (limit - used) + " min left. After the limit Szpila starts jabbing." : "Zostało " + (limit - used) + " min. Po limicie Szpila zaczyna szpilować.");
            return new String[]{title, text};
        }
        return new String[]{
            HabitNotifier.EMOJI_NORMAL + (en ? " Szpila is on guard until " : " Szpila czuwa do ") + WidgetShared.fmtMinute(until),
            (en ? "Watching: " : "Pilnuję: ") + watching};
    }

    /** The ongoing notification while only the shopping guard runs (pure, for tests). */
    static String[] shopGuardText(boolean en, String shops) {
        return new String[]{
            "🛒 " + (en ? "24 h to think it over" : "24 h do namysłu"),
            (en ? "Watching the shops: " : "Pilnuję sklepów: ") + shops
                + (en ? ". Impulse buys go on the list first." : ". Zachcianki najpierw na listę.")};
    }

    /** The service runs now only for the shopping guard (no night / morning / limit phase). */
    private boolean shopOnly() {
        return phase == DayGuard.DAY && !DayGuard.limitActive(cfg, WidgetShared.nowMinute());
    }

    private static String shortList(List<String> list, boolean en, String none) {
        if (list.isEmpty()) return none;
        return String.join(", ", list.subList(0, Math.min(4, list.size()))) + (list.size() > 4 ? (en ? " and more" : " i inne") : "");
    }

    private Notification guardNotification() {
        Set<String> labels = new LinkedHashSet<>();
        for (String pkg : LiveGuard.SOCIAL.keySet()) {
            if (LiveGuard.watched(this, pkg) && LiveGuard.installed(this, pkg)) labels.add(LiveGuard.SOCIAL.get(pkg)[1]);
        }
        List<String> list = new ArrayList<>(labels);
        boolean en = WidgetShared.en(this);
        String watching = list.isEmpty() ? "social media" : String.join(", ", list.subList(0, Math.min(4, list.size())))
            + (list.size() > 4 ? (en ? " and more" : " i inne") : "");
        int until = phase == DayGuard.MORNING ? DayGuard.morningSettings(this).optInt("until", 11 * 60) : LiveGuard.until(this);
        String pending = phase == DayGuard.MORNING ? DayGuard.names(DayGuard.morningPending(this)) : "";
        String[] t;
        if (shopOnly()) {
            List<String> shops = new ArrayList<>();
            for (String pkg : ShopGuard.SHOP.keySet()) {
                if (ShopGuard.watched(this, pkg) && LiveGuard.installed(this, pkg)) shops.add(ShopGuard.label(pkg));
            }
            t = shopGuardText(en, shortList(shops, en, en ? "shopping apps" : "aplikacje zakupowe"));
        } else {
            t = guardText(phase, en, until, watching, pending, usedMin(), DayGuard.limit(this),
                curfewNow(this), LiveGuard.curfewAllowed(this).size());
        }
        PendingIntent open = WidgetShared.openAppIntent(this, 7502);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CH_GUARD)
            .setSmallIcon(R.drawable.ic_stat_szpila)
            .setColor(WidgetShared.AVOID)
            .setContentTitle(t[0])
            .setContentText(t[1])
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
        // Names follow the app language: upsertChannel re-creates a channel whose name changed.
        NotificationChannel guard = new NotificationChannel(CH_GUARD,
            WidgetShared.tr(c, "Szpila czuwa", "Szpila on guard"), NotificationManager.IMPORTANCE_MIN);
        guard.setDescription(WidgetShared.tr(c, "Ciche powiadomienie, gdy strażnik jest aktywny (noc, poranek, dzienny limit, zakupy)",
            "Silent notification while the guard is active (night, morning, daily limit, shopping)"));
        guard.setShowBadge(false);
        WidgetShared.upsertChannel(nm, guard);
        NotificationChannel live = new NotificationChannel(CH_LIVE,
            WidgetShared.tr(c, "Szpila na żywo", "Szpila live"), NotificationManager.IMPORTANCE_HIGH);
        live.setDescription(WidgetShared.tr(c, "Wyskakuje, gdy otwierasz social media w nocy, rano przed zadaniami albo po dziennym limicie",
            "Pops up when you open social media at night, in the morning before your habits, or past the daily limit"));
        live.enableVibration(true);
        live.setVibrationPattern(new long[]{0, 180, 90, 180});
        WidgetShared.upsertChannel(nm, live);
    }

    private static boolean canNotify(Context c) {
        if (Build.VERSION.SDK_INT >= 33
                && c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        return NotificationManagerCompat.from(c).areNotificationsEnabled();
    }
}
