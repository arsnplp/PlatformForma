import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ownerFilter } from "@/lib/auth/ownership";
import type { CurrentUser } from "@/lib/auth/session";
import { setStudentCompany } from "@/lib/actions/users";
import { NativeSelect } from "./native-select";
import { Button } from "@/components/ui/button";

// Entreprise de rattachement d'un élève, modifiable depuis son dossier.
export async function StudentCompany({
  me,
  userId,
  company,
}: {
  me: CurrentUser;
  userId: string;
  company: { id: string; name: string } | null;
}) {
  const companies = await prisma.company.findMany({
    where: { ...ownerFilter(me), archivedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <form action={setStudentCompany.bind(null, userId)} className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-foreground-secondary">Entreprise</span>
      {company ? (
        <Link href={`/admin/entreprises/${company.id}`} className="text-sm font-medium hover:underline">
          {company.name}
        </Link>
      ) : null}
      <NativeSelect name="companyId" defaultValue={company?.id ?? ""} className="h-8 w-auto min-w-[12rem]">
        <option value="">À titre personnel (sans entreprise)</option>
        {companies.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </NativeSelect>
      <Button type="submit" variant="outline" size="sm">Enregistrer</Button>
    </form>
  );
}
