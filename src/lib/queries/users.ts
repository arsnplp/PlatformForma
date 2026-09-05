import { prisma } from "@/lib/prisma";

export async function listBackofficeUsers() {
  return prisma.user.findMany({
    where: {
      archivedAt: null,
      userRoles: {
        some: {
          role: {
            rolePermissions: {
              some: {
                permission: {
                  key: "can_access_backoffice",
                },
              },
            },
          },
        },
      },
    },
    select: {
      id: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });
}
