import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { grantRole } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function UsersPage() {
  const me = await requireUser("/admin/utilisateurs");
  if (!hasPermission(me, "can_manage_users")) redirect("/admin");
  const canGrant = hasPermission(me, "can_grant_admin");

  const users = await prisma.user.findMany({
    where: { archivedAt: null },
    include: { userRoles: { include: { role: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Utilisateurs</h1>
      <p className="mt-2 text-foreground-secondary">
        Les rôles et leurs permissions sont des données : rien n&apos;est codé en dur.
      </p>

      <Table className="mt-8">
        <TableHeader>
          <TableRow>
            <TableHead>Nom</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rôles</TableHead>
            {canGrant ? <TableHead className="text-right">Actions</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => {
            const roleKeys = u.userRoles.map((ur) => ur.role.key);
            const isSuperAdmin = roleKeys.includes("super_admin");
            return (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-foreground-secondary">{u.email}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {u.userRoles.map((ur) => (
                      <span
                        key={ur.roleId}
                        className="rounded-sm bg-status-gray-bg px-2 py-0.5 text-xs text-status-gray"
                      >
                        {ur.role.label}
                      </span>
                    ))}
                  </div>
                </TableCell>
                {canGrant ? (
                  <TableCell className="text-right">
                    {!isSuperAdmin ? (
                      <form action={grantRole.bind(null, u.id, "super_admin")}>
                        <Button type="submit" variant="outline" size="sm">
                          Promouvoir super-admin
                        </Button>
                      </form>
                    ) : null}
                  </TableCell>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
