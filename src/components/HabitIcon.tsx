import type React from "react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  name: string;
  className?: string;
  size?: number;
  strokeWidth?: number;
  style?: React.CSSProperties;
}

// Custom icons lucide doesn't ship (e.g. a tooth). Same 24x24 viewBox and
// stroke style as lucide so they blend in. The path is also used verbatim by
// the native Android widget drawable (ic_habit_tooth.xml).
const CUSTOM_PATHS: Record<string, string> = {
  Tooth:
    "M7.5 3.6C5.5 3.6 4 5.1 4 7.6c0 2 .5 3.6 1 6 .4 2 .6 5.4 1.8 6.6.9.9 1.7.2 2-1 .4-1.6.7-3.6 1.2-4.1.4-.4 1.6-.4 2 0 .5.5.8 2.5 1.2 4.1.3 1.2 1.1 1.9 2 1 1.2-1.2 1.4-4.6 1.8-6.6.5-2.4 1-4 1-6C20 5.1 18.5 3.6 16.5 3.6c-1.6 0-2.6 1-4.5 1s-2.9-1-4.5-1Z",
};

export function HabitIcon({ name, className, size = 24, strokeWidth = 2, style }: Props) {
  const custom = CUSTOM_PATHS[name];
  if (custom) {
    return (
      <svg
        className={className}
        style={style}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={custom} />
      </svg>
    );
  }

  const Icon =
    ((LucideIcons as unknown as Record<string, LucideIcon>)[name] as LucideIcon) ??
    LucideIcons.Circle;
  return <Icon className={className} style={style} size={size} strokeWidth={strokeWidth} />;
}
