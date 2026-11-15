import { useEffect, useState } from "react";
import { Download, RefreshCw, Sparkles } from "lucide-react";
import { currentVersion, notesFor, updatesSupported } from "@/lib/update";
import { mb, useUpdater } from "@/lib/use-updater";
import { isEn, L } from "@/lib/i18n";

/** Release notes, progress, messages and the action buttons - shared by the card and the sheet. */
export function UpdateBody({
  u,
  showCheck,
  title = true,
}: {
  u: ReturnType<typeof useUpdater>;
  showCheck: boolean;
  /** The "Nowa wersja X · N MB" line (the sheet has its own header). */
  title?: boolean;
}) {
  const { state } = u;
  const info = "info" in state ? state.info : undefined;
  return (
    <>
      {info && (
        <div className="mt-3 rounded-xl bg-background p-3">
          <div className={title ? "text-sm font-semibold" : "hidden"}>
            {L("Nowa wersja", "New version")} {info.version}
            {info.size > 0 && (
              <span className="ml-1 font-normal text-muted-foreground">· {mb(info.size)} MB</span>
            )}
          </div>
          <ul className={`${title ? "mt-1.5 " : ""}space-y-1 text-xs text-muted-foreground`}>
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
        {showCheck &&
          (state.kind === "idle" ||
            state.kind === "latest" ||
            (state.kind === "error" && !info)) && (
            <button
              type="button"
              onClick={() => void u.check()}
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
            onClick={() => void u.download(info)}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            data-update-now
          >
            <Download size={15} /> {L("Zaktualizuj teraz", "Update now")}
          </button>
        )}
        {state.kind === "ready" && (
          <button
            type="button"
            onClick={() => void u.install(state.info)}
            className="flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            <Download size={15} /> {L("Zainstaluj", "Install")}
          </button>
        )}
      </div>
    </>
  );
}

/**
 * Settings -> Dane: "Wersja aplikacji". The same flow the "Nowa wersja" sheet offers on its
 * own; here it can also be started by hand. Android only; hidden on the web.
 */
export function UpdateCard() {
  const [version, setVersion] = useState("");
  const u = useUpdater();

  useEffect(() => {
    void currentVersion().then(setVersion);
  }, []);

  if (!updatesSupported()) return null;

  return (
    <div className="rounded-2xl bg-card p-4" data-update-card>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Sparkles size={18} className="text-primary" />
          <span className="font-medium">{L("Wersja aplikacji", "App version")}</span>
        </div>
        <span className="text-sm text-muted-foreground">{version ? `Szpila ${version}` : ""}</span>
      </div>
      <UpdateBody u={u} showCheck />
      <p className="mt-2 text-[11px] text-muted-foreground">
        {L(
          "Szpila sama sprawdza nowe wersje i je proponuje. Pobiera wydanie z GitHuba, sprawdza sumę kontrolną i podpis, a potem otwiera instalator Androida. Twoje dane zostają.",
          "Szpila checks for new versions on its own and offers them. It downloads the release from GitHub, checks its checksum and signature, then opens Android's installer. Your data stays.",
        )}
      </p>
    </div>
  );
}
