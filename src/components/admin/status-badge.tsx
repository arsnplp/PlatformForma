import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/labels";

const tones: Record<StatusTone, string> = {
  gray: "bg-status-gray-bg text-status-gray",
  blue: "bg-status-blue-bg text-status-blue",
  green: "bg-status-green-bg text-status-green",
  yellow: "bg-status-yellow-bg text-status-yellow",
  orange: "bg-status-orange-bg text-status-orange",
  red: "bg-status-red-bg text-status-red",
  purple: "bg-status-purple-bg text-status-purple",
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
