import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// Étapes à faire (pending) des sessions actives de mon périmètre.
// `mine` = assignées à moi, à un de mes rôles, ou non assignées.
export async function listMyPendingSteps(me: CurrentUser, opts: { all?: boolean } = {}) {
  const sessionScope: Prisma.SessionWhereInput = {
    status: { in: ["planned", "running"] },
    ...(canSupervise(me) ? {} : { OR: [{ ownerId: me.id }, { trainerId: me.id }] }),
  };
  const roleIds = (await prisma.userRole.findMany({ where: { userId: me.id }, select: { roleId: true } })).map((r) => r.roleId);
  const assigneeScope: Prisma.StepTemplateWhereInput = opts.all
    ? {}
    : { OR: [{ assigneeUserId: me.id }, { assigneeRoleId: { in: roleIds } }, { assigneeUserId: null, assigneeRoleId: null }] };

  const items = await prisma.stepInstance.findMany({
    where: { status: "pending", session: sessionScope, stepTemplate: assigneeScope },
    include: {
      session: { select: { id: true, name: true, status: true, startDate: true, owner: { select: { name: true } } } },
      stepTemplate: { include: { assigneeUser: { select: { name: true } }, assigneeRole: { select: { label: true } } } },
    },
  });

  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const byDue = (a: (typeof items)[number], b: (typeof items)[number]) => {
    if (a.dueDate && b.dueDate) return a.dueDate.getTime() - b.dueDate.getTime();
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return a.session.startDate.getTime() - b.session.startDate.getTime() || a.stepTemplate.order - b.stepTemplate.order;
  };
  const late = items.filter((i) => i.dueDate && i.dueDate < today).sort(byDue);
  const upcoming = items.filter((i) => i.dueDate && i.dueDate >= today).sort(byDue);
  const undated = items.filter((i) => !i.dueDate).sort(byDue);
  return { late, upcoming, undated, total: items.length, today };
}
