import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess } from "@/lib/queries/student-space";
import { DocumentList } from "@/components/documents/document-list";

// Les pièces de l'élève pour cette session : les siennes, et rien d'autre.
// Les documents de l'entreprise cliente ne lui sont jamais montrés.
export default async function StudentDocumentsPage({ params }: PageProps<"/espace/sessions/[sessionId]/documents">) {
  const { sessionId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}/documents`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { name: true, formationVersion: { select: { formation: { select: { name: true } } } } },
  });

  const documents = access.role === "student"
    ? await prisma.document.findMany({
        where: { sessionId, ownerUserId: me.id, archivedAt: null },
        orderBy: [{ phase: "asc" }, { createdAt: "desc" }],
      })
    : [];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/espace/sessions/${sessionId}`} className="text-sm text-foreground-secondary hover:text-foreground">
          ← {session.formationVersion.formation.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Mes documents</h1>
      </div>

      {access.role === "preview" ? (
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Aperçu formateur</strong> — chaque élève ne voit ici que ses propres pièces.
        </p>
      ) : (
        <>
          <p className="text-sm text-foreground-secondary">
            Vos pièces pour {session.name} : convocation, contrat, attestation, émargements signés.
          </p>
          <DocumentList documents={documents} emptyLabel="Aucun document pour l'instant" />
        </>
      )}
    </div>
  );
}
