import { useEffect, useState } from "react";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import {
  checkForUpdate,
  currentVersion,
  downloadUpdate,
  installUpdate,
  notesFor,
  updatesSupported,
  type ReleaseInfo,
} from "@/lib/update";
import { isEn, L } from "@/lib/i18n";

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; info: ReleaseInfo }
  | { kind: "downloading"; info: ReleaseInfo; progress: number }
  | { kind: "ready"; info: ReleaseInfo; note?: string }
  | { kind: "error"; message: string; info?: ReleaseInfo };

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace(".", L(",", "."));

/**
 * Settings -> Dane: "Wersja aplikacji". Checks the latest GitHub release, downloads the APK
 * in the app (with progress), verifies it natively and opens the system installer - no
 * manual download from GitHub. Android only; hidden on the web.
 */
export function UpdateCard() {
  const [version, setVersion] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  useEffect(() => {
    void currentVersion().then(setVersion);
  }, []);

  if (!updatesSupported()) return null;

  const check = async () => {
    setState({ kind: "checking" });
    try {
      const r = await checkForUpdate();
      setState(
        r.available && r.latest ? { kind: "available", info: r.latest } : { kind: "latest" },
      );
    } catch (e) {
      setState({
        kind: "error",
        message:
          L("Nie udało się sprawdzić (internet?). ", "Couldn't check (internet?). ") +
          (e as Error).message,
      });
    }
  };

  const download = async (info: ReleaseInfo) => {
    setState({ kind: "downloading", info, progress: 0 });
    try {
      await downloadUpdate(info, (p) => setState({ kind: "downloading", info, progress: p }));
      setState({ kind: "ready", info });
      await install(info);
    } catch (e) {
      setState({ kind: "error", info, message: (e as Error).message });
    }
  };

  const install = async (info: ReleaseInfo) => {
    const status = await installUpdate();
    if (status === "permission") {
      setState({
        kind: "ready",
        info,
        note: L(
          "Pozwól Szpili instalować aplikacje (przełącznik w ustawieniach, które się otworzyły), wróć i stuknij „Zainstaluj”.",
          "Allow Szpila to install apps (the switch in the settings that just opened), come back and tap “Install”.",
        ),
      });
    } else if (status === "missing") {
      await download(info);
    } else {
      setState({ kind: "ready", info });
    }
  };

  const info = "info" in state ? state.info : undefined;

  return (
    <div className="rounded-2xl bg-card p-4" data-update-card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-primary" />
          <span className="font-medium">{L("Wersja aplikacji", "App version")}</span>
        </div>
        <span className="text-sm text-muted-foreground">{version ? `Szpila ${version}` : ""}</span>
      </div>

      {info && (
        <div className="mt-3 rounded-xl bg-background p-3">
          <div className="text-sm font-semibold">
            {L("Nowa wersja", "New version")} {info.version}
            {info.size > 0 && (
              <span className="ml-1 font-normal text-muted-foreground">· {mb(info.size)} MB</span>
            )}
          </div>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {notesFor(info.notes, isEn())
              .slice(0, 6)
              .map((n, i) => (
                <li key={i}>{n}</li>
              ))}
          </ul>
        </div>
      )}

      {state.kind === "downloading" && (
        <div className="mt-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-background">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-200"
              style={{ width: `${state.progress < 0 ? 100 : Math.round(state.progress * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {L("Pobieram", "Downloading")}
            {state.progress >= 0 ? ` ${Math.round(state.progress * 100)}%` : "…"}
          </p>
        </div>
      )}

      {state.kind === "latest" && (
        <p className="mt-2 text-xs text-muted-foreground">
          {L("Masz najnowszą wersję. 👌", "You're on the latest version. 👌")}
        </p>
      )}
      {state.kind === "ready" && state.note && (
        <p className="mt-2 text-xs text-muted-foreground">{state.note}</p>
      )}
      {state.kind === "error" && <p className="mt-2 text-xs text-destructive">{state.message}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {(state.kind === "idle" ||
          state.kind === "latest" ||
          (state.kind === "error" && !info)) && (
          <button
            type="button"
            onClick={() => void check()}
            className="flex items-center gap-2 rounded-full bg-background px-4 py-2 text-sm font-medium"
          >
            <RefreshCw size={15} /> {L("Sprawdź aktualizacje", "Check for updates")}
          </button>
        )}
        {state.kind === "checking" && (
          <span className="px-1 py-2 text-sm text-muted-foreground">
            {L("Sprawdzam…", "Checking…")}
          </span>
        )}
        {(state.kind === "available" || (state.kind === "error" && info)) && info && (
          <button
            type="button"
            onClick={() => void download(info)}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Download size={15} /> {L("Pobierz i zainstaluj", "Download and install")}
          </button>
        )}
        {state.kind === "ready" && (
          <button
            type="button"
            onClick={() => void install(state.info)}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Download size={15} /> {L("Zainstaluj", "Install")}
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {L(
          "Pobiera wydanie z GitHuba, sprawdza sumę kontrolną i podpis, a potem otwiera instalator Androida. Twoje dane zostają.",
          "Downloads the release from GitHub, checks its checksum and signature, then opens Android's installer. Your data stays.",
        )}
      </p>
    </div>
  );
}
