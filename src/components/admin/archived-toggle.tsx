import Link from "next/link";
import { cn } from "@/lib/utils";

// Bascule « actives / archivées » via le paramètre ?archived=1 (soft-delete visible, jamais perdu).
export function ArchivedToggle({ basePath, archived }: { basePath: string; archived: boolean }) {
  const item = "rounded-md px-2.5 py-1 text-sm transition-colors";
  return (
    <div className="inline-flex items-center gap-1 rounded-md bg-surface p-0.5">
      <Link
        href={basePath}
        className={cn(item, !archived ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}
      >
        Actives
      </Link>
      <Link
        href={`${basePath}?archived=1`}
        className={cn(item, archived ? "bg-background font-medium shadow-sm" : "text-foreground-secondary hover:text-foreground")}
      >
        Archivées
      </Link>
    </div>
  );
}
