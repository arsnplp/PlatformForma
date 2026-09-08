"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "./native-select";

// Barre de filtres commune aux listes du back-office.
//
// L'état vit dans l'URL : un filtre se partage, se met en favori et survit à un
// rafraîchissement. La recherche est temporisée pour ne pas relancer une
// requête à chaque frappe ; les listes déroulantes s'appliquent aussitôt.

export type FilterOption = { value: string; label: string };
export type FilterDefinition = {
  /// Nom du paramètre dans l'URL.
  key: string;
  label: string;
  options: FilterOption[];
  /// Libellé de l'option « tout », affichée en tête.
  allLabel?: string;
};

const DEBOUNCE_MS = 300;

export function ListFilters({
  searchPlaceholder = "Rechercher",
  filters = [],
}: {
  searchPlaceholder?: string;
  filters?: FilterDefinition[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const [query, setQuery] = useState(params.get("q") ?? "");
  const typed = useRef(false);

  // Applique la recherche après une pause de frappe, sans empiler les requêtes.
  useEffect(() => {
    if (!typed.current) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (query.trim()) next.set("q", query.trim());
      else next.delete("q");
      startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, params, pathname, router]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  }

  const active = filters.some((f) => params.get(f.key)) || Boolean(params.get("q"));

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label className="min-w-[14rem] flex-1 text-xs text-foreground-secondary">
        Recherche
        <Input
          value={query}
          onChange={(e) => { typed.current = true; setQuery(e.target.value); }}
          placeholder={searchPlaceholder}
          className="mt-1 h-9"
          aria-label={searchPlaceholder}
        />
      </label>

      {filters.map((filter) => (
        <label key={filter.key} className="text-xs text-foreground-secondary">
          {filter.label}
          <NativeSelect
            value={params.get(filter.key) ?? ""}
            onChange={(e) => setFilter(filter.key, e.target.value)}
            className="mt-1 h-9 w-auto min-w-[10rem]"
            aria-label={filter.label}
          >
            <option value="">{filter.allLabel ?? "Tous"}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </NativeSelect>
        </label>
      ))}

      {active ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => { setQuery(""); typed.current = false; startTransition(() => router.replace(pathname, { scroll: false })); }}
        >
          Effacer
        </Button>
      ) : null}

      {pending ? <span className="pb-2 text-xs text-foreground-tertiary">…</span> : null}
    </div>
  );
}
