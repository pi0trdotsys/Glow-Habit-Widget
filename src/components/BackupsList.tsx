import { useCallback, useEffect, useState } from "react";
import { FolderOpen, RotateCcw, Trash2 } from "lucide-react";
import { deleteBackup, listBackups, restoreListed, type BackupFile } from "@/lib/backup";
import { L, isEn } from "@/lib/i18n";

const SHOWN = 5;

/** "15 lis 2026, 21:36" / "Nov 15, 2026, 9:36 PM". */
function when(ms: number): string {
  return new Date(ms).toLocaleString(isEn() ? "en-US" : "pl-PL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Settings -> Dane: the backups on the phone, in two groups (saved by you / daily), newest
 * first, each with "Przywróć" and "Usuń". Restoring first saves the current data as a copy.
 * Android only (MediaStore); hidden on the web and when there's nothing yet.
 */
export function BackupsList({
  refreshKey,
  onMessage,
}: {
  /** Bump to re-read the list (e.g. after "Zapisz kopię teraz"). */
  refreshKey: number;
  onMessage: (m: string) => void;
}) {
  const [files, setFiles] = useState<BackupFile[] | null>(null);
  const [all, setAll] = useState<{ manual: boolean; auto: boolean }>({
    manual: false,
    auto: false,
  });
  const [busy, setBusy] = useState("");

  const load = useCallback(() => void listBackups().then(setFiles), []);
  useEffect(load, [load, refreshKey]);

  if (!files || files.length === 0) return null;

  const restore = async (b: BackupFile) => {
    if (
      !confirm(
        L(
          `Przywrócić kopię z ${when(b.modified)}? Obecne dane najpierw zapiszę jako osobną kopię.`,
          `Restore the backup from ${when(b.modified)}? Your current data is saved as a separate copy first.`,
        ),
      )
    )
      return;
    setBusy(b.id);
    try {
      const n = await restoreListed(b);
      onMessage(L(`Przywrócono ${n} zadań.`, `Restored ${n} habits.`));
      load();
    } catch (e) {
      onMessage(L("Nie udało się przywrócić: ", "Couldn't restore: ") + (e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const remove = async (b: BackupFile) => {
    if (
      !confirm(
        L(
          `Usunąć plik ${b.name}? Tego nie da się cofnąć.`,
          `Delete ${b.name}? This can't be undone.`,
        ),
      )
    )
      return;
    const ok = await deleteBackup(b);
    onMessage(
      ok ? L("Usunięto kopię.", "Backup deleted.") : L("Nie udało się usunąć.", "Couldn't delete."),
    );
    load();
  };

  const group = (auto: boolean) => {
    const list = files.filter((f) => f.auto === auto);
    if (list.length === 0) return null;
    const open = auto ? all.auto : all.manual;
    return (
      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {auto
            ? L("Automatyczne (ostatnie 14 dni)", "Automatic (last 14 days)")
            : L("Zapisane przez ciebie", "Saved by you")}
        </div>
        <ul className="space-y-1.5">
          {(open ? list : list.slice(0, SHOWN)).map((b) => (
            <li key={b.id} className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="text-sm">{when(b.modified)}</div>
                <div className="truncate text-[11px] text-muted-foreground">
                  {b.name} · {kb(b.size)}
                </div>
              </div>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void restore(b)}
                className="grid h-9 w-9 place-items-center rounded-full text-primary disabled:opacity-40"
                aria-label={L("Przywróć", "Restore")}
                title={L("Przywróć", "Restore")}
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void remove(b)}
                className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground disabled:opacity-40"
                aria-label={L("Usuń", "Delete")}
                title={L("Usuń", "Delete")}
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
        {list.length > SHOWN && !open && (
          <button
            type="button"
            onClick={() => setAll((a) => ({ ...a, [auto ? "auto" : "manual"]: true }))}
            className="mt-1.5 text-xs font-medium text-primary"
          >
            {L(`Pokaż wszystkie (${list.length})`, `Show all (${list.length})`)}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl bg-card p-4" data-backups-list>
      <div className="flex items-center gap-3">
        <FolderOpen size={18} className="text-primary" />
        <span className="font-medium">{L("Kopie na telefonie", "Backups on this phone")}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {L(
          "Pobrane/Szpila/Kopie · eksporty CSV w Pobrane/Szpila/Eksport",
          "Download/Szpila/Kopie · CSV exports in Download/Szpila/Eksport",
        )}
      </p>
      {group(false)}
      {group(true)}
    </div>
  );
}
