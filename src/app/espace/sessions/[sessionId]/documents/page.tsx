import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess } from "@/lib/queries/student-space";
import { DocumentList } from "@/components/documents/document-list";
import { SlotGrid } from "@/components/documents/slot-grid";
import { UnreadBadge } from "@/components/admin/unread-badge";
import { listStudentSlots } from "@/lib/queries/slots";

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
        // Une pièce déposée dans un carré s'affiche dans son carré, pas deux fois.
        include: { slot: { select: { id: true } } },
      })
    : [];
  // En aperçu, on montre les emplacements du PREMIER élève inscrit : le
  // formateur doit voir la page telle qu'elle est vécue, pas une page vide.
  const previewUserId = access.role === "preview"
    ? (await prisma.enrollment.findFirst({ where: { sessionId }, orderBy: { enrolledAt: "asc" }, select: { userId: true } }))?.userId ?? null
    : null;
  const slots = await listStudentSlots(sessionId, previewUserId ?? me.id);
  const waiting = slots.filter((s) => s.waitingOnHolder).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mes documents</h1>
      </div>

      {access.role === "preview" ? (
        <>
          <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
            <strong>Aperçu formateur</strong> — les emplacements du premier élève inscrit. Chacun ne voit que les siens.
          </p>
          <SlotGrid slots={slots} role="holder" emptyLabel="Aucune demande en cours pour cet élève." />
        </>
      ) : (
        <>
          {/* Ce qu'on attend de lui d'abord : c'est ce qui demande une action. */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">À faire</h2>
              <UnreadBadge count={waiting} />
            </div>
            <p className="text-sm text-foreground-secondary">
              {waiting === 0
                ? "Rien à fournir ni à signer pour l'instant."
                : "Un point rouge signale ce qui manque encore."}
            </p>
            <SlotGrid slots={slots} role="holder" emptyLabel="Votre formateur ne vous demande rien pour l'instant." />
          </section>

          <section className="space-y-3 border-t pt-6">
            <h2 className="text-lg font-semibold">Mes pièces</h2>
            <p className="text-sm text-foreground-secondary">
              Vos pièces pour {session.name} : convocation, contrat, attestation, émargements signés.
            </p>
            <DocumentList
              documents={documents.filter((d) => !d.slot)}
              signable
              emptyLabel="Aucun document pour l'instant"
            />
          </section>
        </>
      )}
    </div>
  );
}
