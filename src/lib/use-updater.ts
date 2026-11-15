// The in-app update flow as a React hook, shared by the Settings card and the "Nowa wersja" sheet.
import { useCallback, useState } from "react";
import { checkForUpdate, downloadUpdate, installUpdate, type ReleaseInfo } from "@/lib/update";
import { L } from "@/lib/i18n";

export type UpdateState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "latest" }
  | { kind: "available"; info: ReleaseInfo }
  | { kind: "downloading"; info: ReleaseInfo; progress: number }
  | { kind: "ready"; info: ReleaseInfo; note?: string }
  | { kind: "error"; message: string; info?: ReleaseInfo };

export const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1).replace(".", L(",", "."));

/**
 * The whole update flow in one place (Settings card and the "Nowa wersja" sheet): check the
 * latest GitHub release, download the APK natively (with progress), verify it natively and
 * open the system installer. `initial` = a release already found (the sheet).
 */
export function useUpdater(initial?: ReleaseInfo) {
  const [state, setState] = useState<UpdateState>(
    initial ? { kind: "available", info: initial } : { kind: "idle" },
  );

  const check = useCallback(async () => {
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
  }, []);

  const install = useCallback(async (info: ReleaseInfo): Promise<void> => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const download = useCallback(
    async (info: ReleaseInfo): Promise<void> => {
      setState({ kind: "downloading", info, progress: 0 });
      try {
        await downloadUpdate(info, (p) => setState({ kind: "downloading", info, progress: p }));
        setState({ kind: "ready", info });
        await install(info);
      } catch (e) {
        setState({ kind: "error", info, message: (e as Error).message });
      }
    },
    [install],
  );

  return { state, check, download, install };
}
