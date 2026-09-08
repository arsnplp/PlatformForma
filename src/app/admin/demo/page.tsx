import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { DemoPanel } from "@/components/admin/demo-panel";

// Données de démonstration (spec §5.2 : flag isDemo + can_generate_demo_data).
export default async function DemoPage() {
  const me = await requireUser("/admin/demo");
  // Réservé au super-administrateur, vérifié côté serveur.
  if (!hasPermission(me, "can_generate_demo_data")) redirect("/admin");

  const sessions = await prisma.session.findMany({
    where: { isDemo: true },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, startDate: true, endDate: true,
      formationVersion: { select: { formation: { select: { name: true } } } },
      _count: { select: { enrollments: true, attendances: true, activityLogs: true, documents: true } },
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Données de démonstration"
        description="Pour montrer la plateforme sans toucher aux dossiers réels. Tout ce qui est fabriqué ici porte la marque « démonstration » : aucun mail ne part, aucune signature n'est demandée au prestataire, et l'export estampille chaque page."
      />

      <DemoPanel />

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Sessions de démonstration</h2>
        {sessions.length === 0 ? (
          <EmptyState title="Aucune session de démonstration">
            Génère-en une pour disposer d&apos;un dossier complet : programme, classes virtuelles, élèves, émargements,
            activité et pièces.
          </EmptyState>
        ) : (
          <ol className="divide-y rounded-md border">
            {sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <Link href={`/admin/sessions/${session.id}`} className="font-medium hover:underline">
                    {session.name}
                  </Link>
                  <span className="block text-xs text-foreground-secondary">
                    {session.formationVersion.formation.name} · du {formatDate(session.startDate)} au {formatDate(session.endDate)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-foreground-tertiary">
                  <StatusBadge tone="orange">Démo</StatusBadge>
                  {session._count.enrollments} élève(s) · {session._count.attendances} émargement(s) ·{" "}
                  {session._count.activityLogs} trace(s) · {session._count.documents} pièce(s)
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
