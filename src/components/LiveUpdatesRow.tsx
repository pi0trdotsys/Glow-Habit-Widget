import { useEffect, useState } from "react";
import { Lock } from "lucide-react";
import { Toggle } from "@/components/HabitForm";
import {
  liveUpdatesStatus,
  openLiveUpdatesSettings,
  type LiveUpdatesStatus,
} from "@/lib/notifications";
import { L } from "@/lib/i18n";

/**
 * "Na żywo na ekranie blokady" under the "Postęp dnia" toggle: on Android 16+ the progress
 * notification becomes a Live Update (top of the lock screen, % chip in the status bar, like
 * Duolingo). Hidden where it can't work (web, older Android). The system can turn live
 * notifications off per app; then a button opens that screen. Re-checked when the user
 * comes back from it.
 */
export function LiveUpdatesRow({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  const [status, setStatus] = useState<LiveUpdatesStatus | null>(null);

  useEffect(() => {
    const check = () => void liveUpdatesStatus().then(setStatus);
    check();
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  if (!status?.supported) return null;

  return (
    <div className="mt-3 border-t border-border pt-3" data-live-updates>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Lock size={15} className="text-primary" />
          <span className="text-sm font-medium">
            {L("Na żywo na ekranie blokady", "Live on the lock screen")}
          </span>
        </div>
        <Toggle checked={checked} disabled={disabled} onChange={onChange} />
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">
        {L(
          "Następne zadanie i postęp dnia na górze ekranu blokady, a procent w pasku statusu - jak w Duolingo.",
          "Your next task and today's progress at the top of the lock screen, with the % in the status bar - like Duolingo.",
        )}
      </p>
      {checked && !status.allowed && (
        <div className="mt-2 rounded-xl bg-background p-3 text-xs">
          <p className="text-muted-foreground">
            {L(
              "System ma wyłączone powiadomienia na żywo dla Szpili, więc pokaże zwykłe powiadomienie.",
              "Live notifications are turned off for Szpila in system settings, so a regular one is shown.",
            )}
          </p>
          <button
            type="button"
            onClick={() => void openLiveUpdatesSettings()}
            className="mt-2 rounded-full bg-primary px-3 py-1.5 font-medium text-primary-foreground"
          >
            {L("Włącz w ustawieniach", "Turn on in settings")}
          </button>
        </div>
      )}
    </div>
  );
}
