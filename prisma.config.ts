import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Prisma 7 : ce fichier n'est lu que par la CLI (migrate, db pull, studio…).
// → on lui donne la connexion DIRECTE (port 5432), obligatoire pour les migrations.
// Le runtime (PrismaClient + driver adapter, voir src/lib/prisma.ts) utilise
// DATABASE_URL, c'est-à-dire le pooler transaction (port 6543, pgbouncer).
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
