import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

// <select> natif stylé sur les tokens : fiable dans les formulaires serveur
// (valeur transmise dans FormData sans état client).
export function NativeSelect({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-3 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    />
  );
}
