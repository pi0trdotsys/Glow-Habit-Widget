package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONObject;
import org.junit.Test;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** "24 h do namysłu": the shopping apps, the block decision, the pass and the phase with the shop guard only. */
public class ShopGuardTest {
    private static final long MIN = 60_000L;
    private static final String ALLEGRO = "pl.allegro";
    private static final String VINTED = "fr.vinted";

    private static int hm(int h, int m) {
        return h * 60 + m;
    }

    @Test
    public void theUsersShopsAreWatchedAndGroceriesAreNot() {
        for (String pkg : Arrays.asList("pl.allegro", "pl.allegro.sale", "com.alibaba.aliexpresshd", "fr.vinted",
                "pl.tablica", "de.zalando.mobile", "pl.xkom", "com.hm.goe", "com.action.consumerapp", "eu.pepco.app",
                "pl.com.rossmann.centauros", "com.einnovation.temu", "com.zzkko")) {
            assertTrue(pkg, ShopGuard.isShop(pkg));
        }
        assertEquals("Allegro", ShopGuard.label(ALLEGRO));
        assertEquals("Allegro Lokalnie", ShopGuard.label("pl.allegro.sale"));
        // grocery / delivery apps stay out (Biedronka, Lidl, Żabka, Glovo)
        for (String pkg : Arrays.asList("com.lidl.eci.lidlplus", "pl.biedronka.app", "pl.zabka.apb2c", "com.glovo")) {
            assertFalse(pkg, ShopGuard.isShop(pkg));
        }
        assertFalse(ShopGuard.isShop(null));
        // never a social media app nor something the curfew always lets through
        for (String pkg : ShopGuard.SHOP.keySet()) {
            assertFalse(pkg, LiveGuard.SOCIAL.containsKey(pkg));
            assertFalse(pkg, LiveGuard.BASE_ESSENTIAL.contains(pkg));
        }
        assertEquals("unknown.pkg", ShopGuard.label("unknown.pkg"));
    }

    @Test
    public void blockDecision() {
        Set<String> none = Collections.emptySet();
        long now = 1_000_000L;
        assertTrue(ShopGuard.blocks(ALLEGRO, true, none, now, 0));
        assertFalse(ShopGuard.blocks(ALLEGRO, false, none, now, 0)); // guard off
        assertFalse(ShopGuard.blocks("com.instagram.android", true, none, now, 0)); // not a shop
        assertFalse(ShopGuard.blocks(null, true, none, now, 0));
        Set<String> off = new HashSet<>(Collections.singletonList(VINTED));
        assertFalse(ShopGuard.blocks(VINTED, true, off, now, 0)); // switched off by the user
        assertTrue(ShopGuard.blocks(ALLEGRO, true, off, now, 0));
        assertTrue(ShopGuard.blocks(ALLEGRO, true, null, now, 0));
    }

    @Test
    public void aPassLetsYouShopForItsMinutesThenTheBlockIsBack() {
        long t0 = 5_000_000L;
        long until = ShopGuard.passEnd(t0, 15);
        assertEquals(t0 + 15 * MIN, until);
        assertFalse(ShopGuard.blocks(ALLEGRO, true, null, t0 + 14 * MIN, until));
        assertTrue(ShopGuard.blocks(ALLEGRO, true, null, t0 + 15 * MIN, until));
        // out-of-range lengths are clamped
        assertEquals(t0 + MIN, ShopGuard.passEnd(t0, 0));
        assertEquals(t0 + ShopGuard.PASS_MIN_MAX * MIN, ShopGuard.passEnd(t0, 10_000));
    }

    @Test
    public void passMinutesFromTheSnapshot() throws Exception {
        assertEquals(ShopGuard.PASS_MIN_DEFAULT, ShopGuard.passMin((JSONObject) null));
        assertEquals(15, ShopGuard.passMin(new JSONObject()));
        assertEquals(30, ShopGuard.passMin(new JSONObject().put("passMin", 30)));
        assertEquals(1, ShopGuard.passMin(new JSONObject().put("passMin", -5)));
        assertEquals(ShopGuard.PASS_MIN_MAX, ShopGuard.passMin(new JSONObject().put("passMin", 999)));
        assertEquals(20_000L, ShopGuard.HOLD_MS);
    }

    @Test
    public void placeholdersAndTheSubLine() {
        assertEquals("Allegro o 23:10, 2. raz, 15 min",
            ShopGuard.fill("{app} o {time}, {count}. raz, {min} min", "Allegro", "23:10", 2, 15));
        assertEquals("24 h do namysłu", ShopGuard.sub(false, 0, 0, 0, 0));
        assertEquals("24 h do namysłu · na liście: 3 · gotowe: 1 · uratowane: 2 (420 zł)",
            ShopGuard.sub(false, 3, 1, 2, 420));
        assertEquals("24 h to think it over · on the list: 1 · let go: 4", ShopGuard.sub(true, 1, 0, 4, 0));
        assertEquals("24 h to think it over · let go: 1 (99 PLN)", ShopGuard.sub(true, 0, 0, 1, 99));
    }

    @Test
    public void aPendingRouteIsFollowedOnlyRightAway() {
        long t = 10_000_000L;
        assertTrue(ShopGuard.routeFresh(t, t));
        assertTrue(ShopGuard.routeFresh(t, t + 4 * MIN));
        assertFalse(ShopGuard.routeFresh(t, t + 6 * MIN));
        assertFalse(ShopGuard.routeFresh(0, t));
        assertFalse(ShopGuard.routeFresh(t, t - 1)); // clock went back
    }

    // ------------------------------------------------------------------ phases

    private static DayGuard.Config cfg(boolean night, boolean morning, boolean day, boolean shop) {
        DayGuard.Config c = new DayGuard.Config();
        c.night = night;
        c.nightStart = hm(23, 30);
        c.nightEnd = hm(5, 0);
        c.morning = morning;
        c.morningUntil = hm(11, 0);
        c.day = day;
        c.shop = shop;
        return c;
    }

    @Test
    public void theShopGuardAloneKeepsTheServiceRunningAllDay() {
        DayGuard.Config shopOnly = cfg(false, false, false, true);
        for (int h = 0; h < 24; h++) assertEquals(DayGuard.DAY, DayGuard.phase(hm(h, 15), shopOnly, false));
        // ...but the daily limit doesn't count or jab
        assertFalse(DayGuard.limitActive(shopOnly, hm(14, 0)));
        assertFalse(DayGuard.countsSocial(DayGuard.DAY, shopOnly, hm(14, 0)));
        // nothing on = off
        assertEquals(DayGuard.OFF, DayGuard.phase(hm(14, 0), cfg(false, false, false, false), false));
    }

    @Test
    public void theOtherPhasesWinOverTheShopGuard() {
        DayGuard.Config all = cfg(true, true, true, true);
        assertEquals(DayGuard.NIGHT, DayGuard.phase(hm(1, 0), all, true));
        assertEquals(DayGuard.MORNING, DayGuard.phase(hm(7, 0), all, true));
        assertEquals(DayGuard.DAY, DayGuard.phase(hm(14, 0), all, false));
        assertTrue(DayGuard.limitActive(all, hm(14, 0)));
        // the night guard off: 00:00-05:00 is shop-only DAY, the limit waits for 05:00
        DayGuard.Config noNight = cfg(false, true, true, true);
        assertEquals(DayGuard.DAY, DayGuard.phase(hm(2, 0), noNight, true));
        assertFalse(DayGuard.limitActive(noNight, hm(2, 0)));
        assertFalse(DayGuard.countsSocial(DayGuard.DAY, noNight, hm(2, 0)));
        assertTrue(DayGuard.countsSocial(DayGuard.DAY, noNight, hm(12, 0)));
    }

    @Test
    public void socialMinutesCountLikeBefore() {
        DayGuard.Config morningOnly = cfg(true, true, false, false);
        assertTrue(DayGuard.countsSocial(DayGuard.MORNING, morningOnly, hm(7, 0)));
        assertFalse(DayGuard.countsSocial(DayGuard.NIGHT, morningOnly, hm(23, 45)));
        DayGuard.Config limit = cfg(false, false, true, false);
        assertTrue(DayGuard.countsSocial(DayGuard.DAY, limit, hm(16, 0)));
        assertFalse(DayGuard.countsSocial(DayGuard.OFF, limit, hm(16, 0)));
    }

    @Test
    public void theStartAlarmCoversTheShopGuard() {
        List<Integer> starts = DayGuard.phaseStarts(cfg(false, false, false, true));
        assertEquals(Collections.singletonList(DayGuard.DAY_START), starts);
        assertEquals(Arrays.asList(hm(23, 30), DayGuard.DAY_START), DayGuard.phaseStarts(cfg(true, true, false, true)));
    }

    @Test
    public void shopOnlyGuardNotification() {
        String[] pl = LiveGuardService.shopGuardText(false, "Allegro, Vinted");
        assertEquals("🛒 24 h do namysłu", pl[0]);
        assertTrue(pl[1].contains("Allegro, Vinted"));
        String[] en = LiveGuardService.shopGuardText(true, "Allegro");
        assertTrue(en[0].contains("24 h to think it over"));
        assertFalse(en[1].matches(".*[ąćęłńóśźż].*"));
    }
}
