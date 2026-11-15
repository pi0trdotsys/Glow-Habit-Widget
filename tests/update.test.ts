import { describe, expect, test } from "bun:test";
import { checkDue, compareVersions, notesFor, parseRelease } from "@/lib/update";

// Shape of api.github.com/repos/.../releases/latest for v2.12.0 (trimmed; real values).
const RELEASE = {
  tag_name: "v2.12.0",
  name: "Szpila 2.12.0",
  draft: false,
  prerelease: false,
  published_at: "2026-11-15T20:40:00Z",
  body:
    "## Szpila 2.12 - postęp dnia na żywo / live daily progress\n\n" +
    '- 🔒 **Na żywo, jak w Duolingo / Live, like Duolingo** - na Androidzie 16+ „Postęp dnia” stoi na górze ekranu blokady. / On Android 16+ "Daily progress" sits at the top of the lock screen.\n' +
    "- Przełącznik: Ustawienia → Powiadomienia. / Toggle in Settings → Notifications.",
  assets: [
    {
      name: "szpila-2.12.0.apk",
      size: 6941048,
      digest: "sha256:f0c6f37cd660c097ffe9d8ee47e73006102103df5252ce46e539881cee2fd6d1",
      // GitHub uses the repository's display casing in asset URLs
      browser_download_url:
        "https://github.com/pi0trdotsys/Glow-Habit-Widget/releases/download/v2.12.0/szpila-2.12.0.apk",
    },
  ],
};

describe("in-app updates: release parsing", () => {
  test("the real release shape becomes an update", () => {
    const r = parseRelease(RELEASE)!;
    expect(r.version).toBe("2.12.0");
    expect(r.apkName).toBe("szpila-2.12.0.apk");
    expect(r.size).toBe(6941048);
    expect(r.sha256).toBe("f0c6f37cd660c097ffe9d8ee47e73006102103df5252ce46e539881cee2fd6d1");
    expect(r.apkUrl).toContain("/releases/download/v2.12.0/");
  });

  test("drafts, pre-releases, odd tags and foreign / non-APK assets are ignored", () => {
    expect(parseRelease({ ...RELEASE, draft: true })).toBeNull();
    expect(parseRelease({ ...RELEASE, prerelease: true })).toBeNull();
    expect(parseRelease({ ...RELEASE, tag_name: "nightly" })).toBeNull();
    expect(parseRelease(null)).toBeNull();
    const foreign = {
      ...RELEASE,
      assets: [{ ...RELEASE.assets[0], browser_download_url: "https://evil.example/szpila.apk" }],
    };
    expect(parseRelease(foreign)).toBeNull();
    const notApk = {
      ...RELEASE,
      assets: [
        {
          ...RELEASE.assets[0],
          browser_download_url: RELEASE.assets[0].browser_download_url + ".zip",
        },
      ],
    };
    expect(parseRelease(notApk)).toBeNull();
  });

  test("a missing or malformed digest just means no checksum (other checks still apply)", () => {
    expect(
      parseRelease({ ...RELEASE, assets: [{ ...RELEASE.assets[0], digest: null }] })!.sha256,
    ).toBe("");
    expect(
      parseRelease({ ...RELEASE, assets: [{ ...RELEASE.assets[0], digest: "md5:abc" }] })!.sha256,
    ).toBe("");
  });

  test("versions compare numerically", () => {
    expect(compareVersions("2.12.0", "2.11.0")).toBe(1);
    expect(compareVersions("2.10.0", "2.9.3")).toBe(1);
    expect(compareVersions("v2.12.0", "2.12.0")).toBe(0);
    expect(compareVersions("2.12", "2.12.0")).toBe(0);
    expect(compareVersions("2.11.9", "2.12.0")).toBe(-1);
  });

  test("release notes in one language, without markdown", () => {
    expect(notesFor(RELEASE.body, false)).toEqual([
      "🔒 Na żywo, jak w Duolingo - na Androidzie 16+ „Postęp dnia” stoi na górze ekranu blokady.",
      "Przełącznik: Ustawienia → Powiadomienia.",
    ]);
    expect(notesFor(RELEASE.body, true)).toEqual([
      '🔒 Live, like Duolingo - On Android 16+ "Daily progress" sits at the top of the lock screen.',
      "Toggle in Settings → Notifications.",
    ]);
  });

  test("the automatic check runs at most once a day", () => {
    localStorage.removeItem("szpila-update-check");
    const now = Date.UTC(2026, 10, 15, 12);
    expect(checkDue(now)).toBe(true);
    localStorage.setItem("szpila-update-check", String(now - 60 * 60 * 1000));
    expect(checkDue(now)).toBe(false);
    localStorage.setItem("szpila-update-check", String(now - 25 * 60 * 60 * 1000));
    expect(checkDue(now)).toBe(true);
  });
});
