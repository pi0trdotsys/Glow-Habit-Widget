// In-app updates: the latest GitHub release of this repo is the update channel. The app
// checks it (once a day on start, or from Settings -> Dane), downloads the APK natively,
// verifies it (SHA-256 from GitHub, package, newer version, same signing key - see
// UpdateManager.java) and hands it to the system installer. Android only.
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export const RELEASES_API =
  "https://api.github.com/repos/pi0trdotsys/glow-habit-widget/releases/latest";
/** Only assets from this path are accepted (mirrors UpdateManager.ALLOWED_PREFIX). */
const ASSET_PREFIX = "https://github.com/pi0trdotsys/glow-habit-widget/releases/download/";
const CHECK_KEY = "szpila-update-check";
const LATER_KEY = "szpila-update-later";
/** How often the app asks GitHub on its own (on start and every return to the front). */
export const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
/** "Później" hides the offer of that version for this long. */
export const LATER_MS = 24 * 60 * 60 * 1000;

export interface ReleaseInfo {
  /** "2.12.0" (the tag without the leading "v"). */
  version: string;
  title: string;
  notes: string;
  apkUrl: string;
  apkName: string;
  size: number;
  /** Lower-case hex SHA-256 GitHub publishes for the asset, or "". */
  sha256: string;
  publishedAt: string;
}

interface GithubAsset {
  name?: string;
  browser_download_url?: string;
  size?: number;
  digest?: string | null;
}
interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string;
  assets?: GithubAsset[];
}

/** The release as an update, or null (draft / pre-release / no valid APK asset). */
export function parseRelease(r: GithubRelease | null | undefined): ReleaseInfo | null {
  if (!r || r.draft || r.prerelease || !r.tag_name) return null;
  const version = r.tag_name.replace(/^v/i, "");
  if (!/^\d+(\.\d+)*$/.test(version)) return null;
  const apk = (r.assets ?? []).find(
    (a) =>
      typeof a.browser_download_url === "string" &&
      a.browser_download_url.toLowerCase().startsWith(ASSET_PREFIX) &&
      a.browser_download_url.toLowerCase().endsWith(".apk"),
  );
  if (!apk?.browser_download_url) return null;
  const digest = (apk.digest ?? "").toLowerCase().replace(/^sha256:/, "");
  return {
    version,
    title: r.name || `Szpila ${version}`,
    notes: r.body ?? "",
    apkUrl: apk.browser_download_url,
    apkName: apk.name ?? "szpila.apk",
    size: apk.size ?? 0,
    sha256: /^[0-9a-f]{64}$/.test(digest) ? digest : "",
    publishedAt: r.published_at ?? "",
  };
}

/** Numeric dotted compare: -1 / 0 / 1 ("2.10.0" > "2.9.3"). */
export function compareVersions(a: string, b: string): number {
  const pa = a
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  const pb = b
    .replace(/^v/i, "")
    .split(".")
    .map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * Release notes for the app, in one language. The release bullets look like
 * "- 🔒 **Tytuł / Title** - opis po polsku. / English description."; lines without the
 * " / " split are kept whole. Markdown bold markers are dropped.
 */
export function notesFor(notes: string, en: boolean): string[] {
  const side = (s: string) => {
    const i = s.lastIndexOf(" / ");
    return i < 0 ? [s, s] : [s.slice(0, i), s.slice(i + 3)];
  };
  return notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => {
      const text = l.slice(2).replace(/\*\*/g, "").trim();
      const dash = text.indexOf(" - ");
      if (dash < 0) return side(text)[en ? 1 : 0];
      const [hPl, hEn] = side(text.slice(0, dash));
      const [bPl, bEn] = side(text.slice(dash + 3));
      // the English title has no emoji of its own: reuse the Polish one's prefix
      const prefix = hEn === hPl ? "" : (/^[^\p{L}\p{N}]*/u.exec(hPl)?.[0] ?? "");
      return en ? `${prefix}${hEn} - ${bEn}` : `${hPl} - ${bPl}`;
    });
}

/** Is an automatic check due (at most every 3 h; localStorage, errors = due)? */
export function checkDue(now = Date.now()): boolean {
  try {
    const last = Number(localStorage.getItem(CHECK_KEY) || 0);
    return !(last > 0 && now - last < CHECK_EVERY_MS);
  } catch {
    return true;
  }
}

/** Did the user say "Później" to this version less than a day ago? */
export function laterFor(version: string, now = Date.now()): boolean {
  try {
    const [v, at] = (localStorage.getItem(LATER_KEY) || "").split("|");
    return v === version && now - Number(at || 0) < LATER_MS;
  } catch {
    return false;
  }
}

export function setLater(version: string, now = Date.now()): void {
  try {
    localStorage.setItem(LATER_KEY, `${version}|${now}`);
  } catch {
    /* ignore */
  }
}

function markChecked(now = Date.now()) {
  try {
    localStorage.setItem(CHECK_KEY, String(now));
  } catch {
    /* ignore */
  }
}

interface UpdatePlugin {
  appVersion(): Promise<{ name: string; code: number }>;
  downloadUpdate(opts: { url: string; sha256: string }): Promise<{ ok: boolean; error?: string }>;
  installUpdate(): Promise<{ status: "started" | "permission" | "missing" }>;
  updateHint(): Promise<{ version: string }>;
  addListener(
    event: "updateProgress",
    cb: (p: { received: number; total: number }) => void,
  ): Promise<PluginListenerHandle>;
}
const Native = registerPlugin<UpdatePlugin>("HabitWidget");

export const updatesSupported = () => Capacitor.isNativePlatform();

export async function currentVersion(): Promise<string> {
  if (!updatesSupported()) return "";
  try {
    return (await Native.appVersion()).name;
  } catch {
    return "";
  }
}

export interface UpdateCheck {
  current: string;
  latest: ReleaseInfo | null;
  available: boolean;
}

/** Asks GitHub for the latest release. Throws on network errors. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  const current = await currentVersion();
  const res = await fetch(RELEASES_API, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub: HTTP ${res.status}`);
  const latest = parseRelease((await res.json()) as GithubRelease);
  markChecked();
  return {
    current,
    latest,
    available: !!latest && !!current && compareVersions(latest.version, current) > 0,
  };
}

/** Downloads + verifies (native). onProgress gets 0..1 (or -1 when the size is unknown). */
export async function downloadUpdate(
  info: ReleaseInfo,
  onProgress: (fraction: number) => void,
): Promise<void> {
  const h = await Native.addListener("updateProgress", ({ received, total }) =>
    onProgress(total > 0 ? received / total : -1),
  );
  try {
    const r = await Native.downloadUpdate({ url: info.apkUrl, sha256: info.sha256 });
    if (!r.ok) throw new Error(r.error || "Download failed");
  } finally {
    void h.remove();
  }
}

/** "started" = the system installer is up; "permission" = allow "install unknown apps", then retry. */
export async function installUpdate(): Promise<"started" | "permission" | "missing"> {
  return (await Native.installUpdate()).status;
}

/**
 * A newer version the phone found on its own in the background (UpdateManager.backgroundCheck,
 * which also posted the "Nowa wersja" notification), or "" - forces a check on the next start.
 */
export async function nativeHint(): Promise<string> {
  if (!updatesSupported()) return "";
  try {
    return (await Native.updateHint()).version ?? "";
  } catch {
    return "";
  }
}
