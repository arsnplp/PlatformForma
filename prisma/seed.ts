import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "../src/lib/prisma";
import { PERMISSIONS, PERMISSION_KEYS, SEED_ROLES } from "../src/lib/auth/permissions";

// Seed idempotent : rôles, permissions, liaisons, compte super-admin.
// Variables : SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME (.env).

function env(name: string): string {
  const v = process.env[name];
  if (!v || v.startsWith("__")) throw new Error(`Variable ${name} manquante ou non remplie dans .env`);
  return v;
}

async function main() {
  // 1. Permissions
  for (const key of PERMISSION_KEYS) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description: PERMISSIONS[key] },
      update: { description: PERMISSIONS[key] },
    });
  }
  console.log(`✓ ${PERMISSION_KEYS.length} permissions`);

  // 2. Rôles + liaisons
  for (const [key, { label, permissions }] of Object.entries(SEED_ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      create: { key, label },
      update: { label },
    });
    for (const permKey of permissions) {
      const permission = await prisma.permission.findUniqueOrThrow({ where: { key: permKey } });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
    console.log(`✓ rôle ${key} (${permissions.length} permissions)`);
  }

  // 3. Compte super-admin (Supabase Auth → trigger → public.users)
  const email = env("SEED_ADMIN_EMAIL");
  const password = env("SEED_ADMIN_PASSWORD");
  const name = process.env.SEED_ADMIN_NAME || email.split("@")[0];

  const admin = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let authUserId: string;
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    if (!/already|exists|registered/i.test(error.message)) throw error;
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw listError;
    const existing = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw new Error("Compte existant mais introuvable dans auth.users");
    authUserId = existing.id;
    console.log("• compte auth déjà existant, réutilisé");
  } else {
    authUserId = created.user.id;
    console.log("✓ compte auth créé");
  }

  // Le trigger crée la ligne public.users ; on la garantit quand même (idempotence).
  // Ne jamais écraser le nom d'un compte existant (modifiable dans l'app).
  await prisma.user.upsert({
    where: { id: authUserId },
    create: { id: authUserId, email, name },
    update: {},
  });

  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { key: "super_admin" } });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: authUserId, roleId: superAdmin.id } },
    create: { userId: authUserId, roleId: superAdmin.id },
    update: {},
  });
  console.log(`✓ ${email} est super_admin`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
