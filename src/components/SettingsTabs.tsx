import { Bell, Cat, Database, ShieldAlert } from "lucide-react";
import { L } from "@/lib/i18n";

export type SettingsTab = "szpila" | "guard" | "notifications" | "data";

export const SETTINGS_TABS: SettingsTab[] = ["szpila", "guard", "notifications", "data"];

export function tabLabel(t: SettingsTab): string {
  switch (t) {
    case "szpila":
      return "Szpila";
    case "guard":
      return L("Strażnik", "Guard");
    case "notifications":
      return L("Powiadomienia", "Notifications");
    default:
      return L("Dane", "Data");
  }
}

const ICON = { szpila: Cat, guard: ShieldAlert, notifications: Bell, data: Database };

/** A valid tab from anything (URL search param); defaults to Szpila. */
export function parseTab(v: unknown): SettingsTab {
  return SETTINGS_TABS.includes(v as SettingsTab) ? (v as SettingsTab) : "szpila";
}

/** Settings sections: sticky segmented bar under the header. */
export function SettingsTabs({
  tab,
  onChange,
}: {
  tab: SettingsTab;
  onChange: (t: SettingsTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={L("Sekcje ustawień", "Settings sections")}
      className="sticky top-0 z-20 -mx-5 mb-1 grid grid-cols-4 gap-1 bg-background/90 px-5 py-2 backdrop-blur-xl"
    >
      {SETTINGS_TABS.map((t) => {
        const Icon = ICON[t];
        const active = t === tab;
        return (
          <button
            key={t}
            role="tab"
            aria-selected={active}
            data-tab={t}
            onClick={() => onChange(t)}
            className="flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-semibold transition"
            style={{
              backgroundColor: active ? "var(--card)" : "transparent",
              color: active ? "var(--foreground)" : "var(--muted-foreground)",
              boxShadow: active ? "inset 0 0 0 1px var(--border)" : undefined,
            }}
          >
            <Icon size={17} strokeWidth={active ? 2.4 : 1.9} />
            {tabLabel(t)}
          </button>
        );
      })}
    </div>
  );
}
