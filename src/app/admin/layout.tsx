import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// Layout minimal du back-office. Sera enrichi (navigation, double vue) à l'étape 4.
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser("/admin");
  if (!hasPermission(user, "can_access_backoffice")) redirect("/");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/admin" className="font-medium">
            Back-office
          </Link>
          {hasPermission(user, "can_manage_users") ? (
            <Link href="/admin/utilisateurs" className="text-foreground-secondary hover:text-foreground">
              Utilisateurs
            </Link>
          ) : null}
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
