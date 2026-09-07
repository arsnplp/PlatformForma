import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// Espace élève (spec §11) : même design system que le back-office, mais dépouillé.
// L'élève ne voit qu'une chose à la fois : ses formations, puis son contenu.
export default async function EspaceLayout({ children }: LayoutProps<"/espace">) {
  const user = await requireUser("/espace");
  const isStaff = hasPermission(user, "can_access_backoffice");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/espace" className="text-sm font-medium">
            Mon espace de formation
          </Link>
          <div className="flex items-center gap-3 text-sm">
            {isStaff ? (
              <Link href="/admin" className="text-foreground-secondary hover:text-foreground">
                Back-office
              </Link>
            ) : null}
            <span className="text-foreground-secondary">{user.name}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">Se déconnecter</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
