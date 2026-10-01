package app.lovable.glow_habit_widget;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * "24 h do namysłu": a shopping app in the foreground gets a full-screen block
 * (LiveGuardService.shopBlock) - write the thing on the wishlist and decide
 * tomorrow, leave, or hold 20 s for a short "I really must buy it now" pass.
 * Settings come from the snapshot (live.shop, see src/lib/shop.ts shopState).
 * Pure parts are unit-tested (ShopGuardTest).
 */
final class ShopGuard {
    /** Holding the block's button this long lets you shop for passMin minutes. */
    static final long HOLD_MS = 20_000L;
    static final int PASS_MIN_DEFAULT = 15;
    static final int PASS_MIN_MAX = 120;
    /** A deep link from the block is followed only if the app opens within this time. */
    static final long ROUTE_TTL_MS = 5 * 60_000L;

    /** Watched shopping apps: package -> label. Mirrors SHOP_APPS in src/lib/shop.ts (no grocery apps). */
    static final Map<String, String> SHOP = new LinkedHashMap<>();

    static {
        SHOP.put("pl.allegro", "Allegro");
        SHOP.put("pl.allegro.sale", "Allegro Lokalnie");
        SHOP.put("com.alibaba.aliexpresshd", "AliExpress");
        SHOP.put("com.einnovation.temu", "Temu");
        SHOP.put("com.zzkko", "Shein");
        SHOP.put("com.amazon.mShop.android.shopping", "Amazon");
        SHOP.put("fr.vinted", "Vinted");
        SHOP.put("pl.tablica", "OLX");
        SHOP.put("de.zalando.mobile", "Zalando");
        SHOP.put("pl.xkom", "x-kom");
        SHOP.put("com.hm.goe", "H&M");
        SHOP.put("com.inditex.zara", "Zara");
        SHOP.put("com.action.consumerapp", "Action");
        SHOP.put("eu.pepco.app", "Pepco");
        SHOP.put("com.ebay.mobile", "eBay");
        SHOP.put("com.contextlogic.wish", "Wish");
        SHOP.put("pl.ceneo", "Ceneo");
        SHOP.put("pl.com.rossmann.centauros", "Rossmann");
    }

    private ShopGuard() {}

    // ------------------------------------------------------------------ pure logic

    static boolean isShop(String pkg) {
        return pkg != null && SHOP.containsKey(pkg);
    }

    /** Does the shopping guard cover this foreground app right now? */
    static boolean blocks(String pkg, boolean enabled, Set<String> off, long now, long passUntil) {
        if (!enabled || !isShop(pkg)) return false;
        if (off != null && off.contains(pkg)) return false;
        return now >= passUntil;
    }

    /** Pass length from the settings: default 15 min, 1..120. */
    static int passMin(JSONObject shop) {
        int m = shop != null ? shop.optInt("passMin", PASS_MIN_DEFAULT) : PASS_MIN_DEFAULT;
        return Math.max(1, Math.min(PASS_MIN_MAX, m));
    }

    static long passEnd(long now, int minutes) {
        return now + Math.max(1, Math.min(PASS_MIN_MAX, minutes)) * 60_000L;
    }

    /** {app} {time} {count} (blocks today) {min} (pass minutes) in a line. */
    static String fill(String line, String app, String time, int count, int passMin) {
        return LiveGuard.fill(line, app, 0, time, count).replace("{min}", String.valueOf(passMin));
    }

    /** "24 h do namysłu · na liście: 3 · gotowe: 1 · uratowane: 2 (420 zł)". */
    static String sub(boolean en, int waiting, int ready, int saved, int savedMoney) {
        StringBuilder sb = new StringBuilder(en ? "24 h to think it over" : "24 h do namysłu");
        if (waiting > 0) sb.append(en ? " · on the list: " : " · na liście: ").append(waiting);
        if (ready > 0) sb.append(en ? " · ready: " : " · gotowe: ").append(ready);
        if (saved > 0) {
            sb.append(en ? " · let go: " : " · uratowane: ").append(saved);
            if (savedMoney > 0) sb.append(" (").append(savedMoney).append(en ? " PLN)" : " zł)");
        }
        return sb.toString();
    }

    /** A pending route is followed only shortly after it was set (not days later). */
    static boolean routeFresh(long setAt, long now) {
        return setAt > 0 && now >= setAt && now - setAt <= ROUTE_TTL_MS;
    }

    static String label(String pkg) {
        String l = pkg != null ? SHOP.get(pkg) : null;
        return l != null ? l : pkg;
    }

    // ------------------------------------------------------------------ settings (snapshot)

    static JSONObject settings(Context c) {
        JSONObject s = LiveGuard.settings(c).optJSONObject("shop");
        return s != null ? s : new JSONObject();
    }

    static boolean enabled(Context c) {
        return settings(c).optBoolean("enabled", false);
    }

    static Set<String> off(Context c) {
        Set<String> out = new HashSet<>();
        JSONArray a = settings(c).optJSONArray("off");
        if (a != null) for (int i = 0; i < a.length(); i++) out.add(a.optString(i));
        return out;
    }

    static boolean watched(Context c, String pkg) {
        return isShop(pkg) && !off(c).contains(pkg);
    }

    static int passMin(Context c) {
        return passMin(settings(c));
    }

    // ------------------------------------------------------------------ prefs: pass, counters, deep link

    static long passUntil(Context c) {
        return LiveGuard.prefs(c).getLong("shop_pass_until", 0);
    }

    static void pass(Context c, int minutes) {
        LiveGuard.prefs(c).edit().putLong("shop_pass_until", passEnd(System.currentTimeMillis(), minutes)).apply();
    }

    /** Per calendar day counters: "shop_blocks", "shop_passes" (held through), "shop_wish" (wrote it down). */
    static synchronized int countDay(Context c, String key) {
        String day = WidgetShared.today();
        try {
            JSONObject o = new JSONObject(LiveGuard.prefs(c).getString(key, "{}"));
            int n = o.optInt(day, 0) + 1;
            o.put(day, n);
            JSONArray names = o.names();
            if (names != null && names.length() > 120) {
                String oldest = null;
                for (int i = 0; i < names.length(); i++) {
                    String k = names.getString(i);
                    if (oldest == null || k.compareTo(oldest) < 0) oldest = k;
                }
                o.remove(oldest);
            }
            LiveGuard.prefs(c).edit().putString(key, o.toString()).apply();
            return n;
        } catch (Exception e) {
            return 1;
        }
    }

    static int today(Context c, String key) {
        return LiveGuard.counts(c, key).optInt(WidgetShared.today(), 0);
    }

    /** A screen for the web app to open on its next start/resume (e.g. "/wishlist?add=1"). */
    static void setPendingRoute(Context c, String route) {
        LiveGuard.prefs(c).edit().putString("pending_route", route)
            .putLong("pending_route_at", System.currentTimeMillis()).apply();
    }

    /** The pending route (once - it's cleared), or "" if none / stale. */
    static String takePendingRoute(Context c) {
        android.content.SharedPreferences p = LiveGuard.prefs(c);
        String route = p.getString("pending_route", "");
        long at = p.getLong("pending_route_at", 0);
        if (route.isEmpty()) return "";
        p.edit().remove("pending_route").remove("pending_route_at").apply();
        return routeFresh(at, System.currentTimeMillis()) ? route : "";
    }
}
