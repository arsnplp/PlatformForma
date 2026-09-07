import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess } from "@/lib/queries/student-space";
import { ensureConversation } from "@/lib/queries/conversations";
import { prisma } from "@/lib/prisma";
import { MessageThread } from "@/components/content/message-thread";

// Fil de l'élève avec son formateur, pour cette session (spec §11).
export default async function StudentMessagesPage({ params }: PageProps<"/espace/sessions/[sessionId]/messages">) {
  const { sessionId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}/messages`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const session = await prisma.session.findUniqueOrThrow({
    where: { id: sessionId },
    select: { name: true, status: true, trainer: { select: { name: true } }, formationVersion: { select: { formation: { select: { name: true } } } } },
  });

  const header = (
    <div>
      <Link href={`/espace/sessions/${sessionId}`} className="text-sm text-foreground-secondary hover:text-foreground">
        ← {session.formationVersion.formation.name}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Messages</h1>
    </div>
  );

  // Le formateur en aperçu n'a pas de fil à lui : ses fils sont au back-office.
  if (access.role === "preview") {
    return (
      <div className="space-y-6">
        {header}
        <p className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
          <strong>Aperçu formateur</strong> — chaque élève a son propre fil, privé. Ouvrez-les depuis la fiche de session.
        </p>
      </div>
    );
  }

  const conversation = await ensureConversation(sessionId, me.id);

  return (
    <div className="space-y-6">
      {header}
      <p className="text-sm text-foreground-secondary">
        Vos échanges avec {session.trainer?.name ?? "votre formateur"} pour {session.name}. Les messages envoyés
        automatiquement par la plateforme apparaissent aussi ici.
      </p>
      <MessageThread conversationId={conversation.id} viewerId={me.id} readOnly={session.status === "cancelled"} />
    </div>
  );
}
