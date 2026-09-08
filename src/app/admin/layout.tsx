import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { ADMIN_NAV } from "@/components/admin/nav";
import { UnreadBadge } from "@/components/admin/unread-badge";
import { countUnreadMessages } from "@/lib/queries/conversations";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser("/admin");
  if (!hasPermission(user, "can_access_backoffice")) redirect("/espace");

  const items = ADMIN_NAV.filter((i) => !i.permission || hasPermission(user, i.permission));
  // Messages qui attendent une réponse : visible depuis n'importe quelle page.
  const unread = await countUnreadMessages(user);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/admin" className="font-medium">
            Back-office
          </Link>
          {items.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className="flex items-center gap-1.5 text-foreground-secondary hover:text-foreground"
            >
              {i.label}
              {i.href === "/admin/conversations" ? <UnreadBadge count={unread} /> : null}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-foreground-secondary">{user.name}</span>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="sm">
              Se déconnecter
            </Button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
