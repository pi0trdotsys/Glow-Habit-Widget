package app.lovable.glow_habit_widget;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Backup folders, the one-time sorting of old files, daily-copy retention; update URL checks. */
public class BackupStoreTest {
    @Test
    public void folders() {
        assertEquals("Download/Szpila/Kopie/", BackupStore.relPath(BackupStore.Dir.MANUAL));
        assertEquals("Download/Szpila/Kopie/Automatyczne/", BackupStore.relPath(BackupStore.Dir.AUTO));
        assertEquals("Download/Szpila/Eksport/", BackupStore.relPath(BackupStore.Dir.EXPORT));
        assertEquals("szpila-auto-2026-11-15.json", BackupStore.autoName("2026-11-15"));
    }

    @Test
    public void oldFlatFilesAreSortedIntoFolders() {
        // the old rotating daily copies -> Automatyczne
        assertEquals(BackupStore.Dir.AUTO, BackupStore.migrationTarget("szpila-kopia-pon.json"));
        assertEquals(BackupStore.Dir.AUTO, BackupStore.migrationTarget("szpila-kopia-nd.json"));
        assertEquals(BackupStore.Dir.AUTO, BackupStore.migrationTarget("loop-kopia-sr.json"));
        // dated copies you saved (both languages, old Loop names) -> Kopie
        assertEquals(BackupStore.Dir.MANUAL, BackupStore.migrationTarget("szpila-kopia-2026-10-01.json"));
        assertEquals(BackupStore.Dir.MANUAL, BackupStore.migrationTarget("szpila-backup-2026-10-01.json"));
        assertEquals(BackupStore.Dir.MANUAL, BackupStore.migrationTarget("loop-habits-2026-07-05.json"));
        // CSV -> Eksport; anything else stays where it is
        assertEquals(BackupStore.Dir.EXPORT, BackupStore.migrationTarget("szpila-historia-2026-09-23.csv"));
        assertNull(BackupStore.migrationTarget("notes.txt"));
        assertNull(BackupStore.migrationTarget(null));
        assertFalse(BackupStore.isWeekdayCopy("szpila-kopia-poniedzialek.json"));
    }

    @Test
    public void dailyCopiesKeepTheNewest14() {
        List<String> names = new ArrayList<>();
        for (int d = 1; d <= 20; d++) names.add(BackupStore.autoName(String.format("2026-11-%02d", d)));
        names.add("szpila-kopia-pon.json"); // not a dated daily copy: never pruned
        List<String> drop = BackupStore.autoToPrune(names, 14);
        assertEquals(6, drop.size());
        assertTrue(drop.contains("szpila-auto-2026-11-01.json"));
        assertTrue(drop.contains("szpila-auto-2026-11-06.json"));
        assertFalse(drop.contains("szpila-auto-2026-11-07.json"));
        assertFalse(drop.contains("szpila-kopia-pon.json"));
        assertTrue(BackupStore.autoToPrune(Arrays.asList("szpila-auto-2026-11-01.json"), 14).isEmpty());
    }

    @Test
    public void onlyThisReposReleaseApksAreDownloaded() {
        assertTrue(UpdateManager.allowedUrl(
            "https://github.com/pi0trdotsys/Glow-Habit-Widget/releases/download/v2.12.0/szpila-2.12.0.apk"));
        assertFalse(UpdateManager.allowedUrl("https://evil.example/releases/download/v1/szpila.apk"));
        assertFalse(UpdateManager.allowedUrl(
            "https://github.com/someone-else/glow-habit-widget/releases/download/v1/szpila.apk"));
        assertFalse(UpdateManager.allowedUrl(
            "https://github.com/pi0trdotsys/glow-habit-widget/releases/download/v1/notes.txt"));
        assertFalse(UpdateManager.allowedUrl(
            "https://github.com/pi0trdotsys/glow-habit-widget/releases/download/../../x.apk"));
        assertFalse(UpdateManager.allowedUrl(null));
    }

    @Test
    public void checksumsAreNormalized() {
        String h = "f0c6f37cd660c097ffe9d8ee47e73006102103df5252ce46e539881cee2fd6d1";
        assertEquals(h, UpdateManager.normalizeSha("sha256:" + h));
        assertEquals(h, UpdateManager.normalizeSha(h.toUpperCase()));
        assertEquals("", UpdateManager.normalizeSha("md5:abc"));
        assertEquals("", UpdateManager.normalizeSha(null));
    }
}
