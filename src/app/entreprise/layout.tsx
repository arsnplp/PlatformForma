import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getContactCompany } from "@/lib/queries/company-space";
import { logout } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// Espace entreprise : même design system que le reste, aussi dépouillé que
// l'espace élève. Le contact n'a qu'une entreprise, donc pas de navigation
// entre plusieurs dossiers.
export default async function EntrepriseLayout({ children }: LayoutProps<"/entreprise">) {
  const user = await requireUser("/entreprise");
  const company = await getContactCompany(user);
  // Ni contact, ni entreprise rattachée : cet espace n'a rien à lui montrer.
  if (!company) redirect("/espace");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/entreprise" className="text-sm font-medium">
            {company.name}
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-foreground-secondary">{user.name}</span>
            <form action={logout}>
              <Button type="submit" variant="ghost" size="sm">Se déconnecter</Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
