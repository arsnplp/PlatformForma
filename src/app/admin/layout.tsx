import { redirect } from "next/navigation";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { ADMIN_NAV, ADMIN_PEOPLE, ADMIN_MORE } from "@/components/admin/nav";
import { NavBar } from "@/components/admin/nav-bar";
import { countUnreadMessages } from "@/lib/queries/conversations";
import { AssistantBubble } from "@/components/admin/assistant-bubble";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireUser("/admin");
  if (!hasPermission(user, "can_access_backoffice")) redirect("/espace");

  const allowed = (items: typeof ADMIN_NAV) =>
    items.filter((i) => !i.permission || hasPermission(user, i.permission));
  // Messages qui attendent une réponse : visible depuis n'importe quelle page.
  const unread = await countUnreadMessages(user);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="flex items-center justify-between gap-6 px-6 py-3">
          <NavBar
            links={allowed(ADMIN_NAV)}
            people={allowed(ADMIN_PEOPLE)}
            more={allowed(ADMIN_MORE)}
            unread={unread}
          />
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <span className="text-foreground-secondary">{user.name}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">Se déconnecter</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">{children}</main>

      {/* L'assistant n'apparaît que pour qui a le droit de s'en servir, et
          seulement si la plateforme a une clé pour le faire raisonner. */}
      {hasPermission(user, "can_use_assistant") && process.env.ANTHROPIC_API_KEY ? <AssistantBubble /> : null}
    </div>
  );
}
