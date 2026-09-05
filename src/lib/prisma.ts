import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Client Prisma runtime (Prisma 7 + driver adapter pg).
// Utilise DATABASE_URL = pooler transaction Supabase (port 6543, pgbouncer).
// Les migrations, elles, passent par DIRECT_URL via prisma.config.ts.
// Singleton pour éviter d'ouvrir un pool à chaque hot-reload en dev.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL manquante dans l'environnement");
}

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
