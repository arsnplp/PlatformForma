"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavLink } from "./nav";
import { UnreadBadge } from "./unread-badge";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// Barre du back-office. La page courante est soulignée : savoir où l'on est
// vaut mieux que de le deviner au contenu.
export function NavBar({
  links,
  people,
  more,
  unread,
}: {
  links: NavLink[];
  people: NavLink[];
  more: NavLink[];
  /// Messages non lus, pour la pastille.
  unread: number;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const item = "flex items-center gap-1.5 border-b-2 py-0.5 transition-colors";
  const on = "border-foreground font-medium text-foreground";
  const off = "border-transparent text-foreground-secondary hover:text-foreground";

  return (
    <nav className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
      <Link href="/admin" className={cn(item, isActive("/admin") && pathname === "/admin" ? on : off, "font-medium")}>
        Back-office
      </Link>

      {links.map((l) => (
        <Link key={l.href} href={l.href} className={cn(item, isActive(l.href) ? on : off)}>
          {l.label}
          {l.href === "/admin/conversations" ? <UnreadBadge count={unread} /> : null}
        </Link>
      ))}

      {people.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger className={cn(item, people.some((p) => isActive(p.href)) ? on : off, "outline-none")}>
            Personnes
            <span aria-hidden className="text-xs">▾</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-48">
            {people.map((p) => (
              <DropdownMenuItem key={p.href} asChild>
                <Link href={p.href}>{p.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label="Plus"
            className={cn(item, more.some((m) => isActive(m.href)) ? on : off, "outline-none")}
          >
            <span aria-hidden>⋯</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-56">
            {more.map((m) => (
              <DropdownMenuItem key={m.href} asChild>
                <Link href={m.href}>{m.label}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </nav>
  );
}
