import { cn } from "@/lib/utils";

// Pastille de fils non lus. Rouge parce qu'elle appelle une action, et
// seulement là : la couleur ne sert jamais à décorer (spec §3).
export function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      aria-label={`${count} conversation(s) non lue(s)`}
      className={cn(
        "inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-status-red px-1 text-[10px] font-medium leading-none text-white tabular-nums",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}
