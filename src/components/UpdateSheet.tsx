import { createPortal } from "react-dom";
import { AnimatePresence, m } from "framer-motion";
import { Sparkles } from "lucide-react";
import { setLater, type ReleaseInfo } from "@/lib/update";
import { useBackHandler } from "@/lib/back";
import { L } from "@/lib/i18n";
import { UpdateBody } from "./UpdateCard";
import { mb } from "@/lib/use-updater";
import { useUpdater } from "@/lib/use-updater";

/**
 * "Nowa wersja": offered on its own when the app finds a newer release (start, return to the
 * front, or the background check's notification). "Zaktualizuj teraz" downloads, verifies and
 * installs right here; "Później" hides this version for a day.
 */
export function UpdateSheet({ info, onClose }: { info: ReleaseInfo | null; onClose: () => void }) {
  const later = () => {
    if (info) setLater(info.version);
    onClose();
  };
  useBackHandler(!!info, later);
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {info && (
        <>
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={later}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <m.div
            key="sheet"
            role="dialog"
            aria-label={L("Nowa wersja Szpili", "New Szpila version")}
            data-update-sheet
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            exit={{ y: "110%" }}
            transition={{ type: "spring", stiffness: 420, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
          >
            <div className="rounded-3xl border border-border bg-card p-4 shadow-2xl">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
              <Body info={info} later={later} />
            </div>
          </m.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function Body({ info, later }: { info: ReleaseInfo; later: () => void }) {
  const u = useUpdater(info);
  const busy = u.state.kind === "downloading";
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
          <Sparkles size={20} />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">
            {L(`Nowa Szpila ${info.version} 🎉`, `New Szpila ${info.version} 🎉`)}
          </div>
          <div className="text-xs text-muted-foreground">
            {info.size > 0 && `${mb(info.size)} MB · `}
            {L("bez wychodzenia z aplikacji, dane zostają", "right here, your data stays")}
          </div>
        </div>
      </div>
      <UpdateBody u={u} showCheck={false} title={false} />
      {!busy && (
        <button
          type="button"
          onClick={later}
          className="mt-2 w-full rounded-full py-2 text-sm font-medium text-muted-foreground"
        >
          {L("Później", "Later")}
        </button>
      )}
    </>
  );
}
