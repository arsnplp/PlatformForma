import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getSessionAccess } from "@/lib/queries/student-space";
import { getSessionOutline } from "@/lib/queries/outline";
import { unreadBySession } from "@/lib/queries/conversations";
import { countWaitingSlots } from "@/lib/queries/slots";
import { CourseOutline } from "@/components/content/course-outline";

// Toutes les pages d'une session partagent le même sommaire : l'élève ne perd
// jamais le fil, et ses documents sont à un clic depuis n'importe où.
export default async function SessionLayout({ children, params }: LayoutProps<"/espace/sessions/[sessionId]">) {
  const { sessionId } = await params;
  const me = await requireUser(`/espace/sessions/${sessionId}`);
  const access = await getSessionAccess(sessionId, me);
  if (!access) notFound();

  const outline = await getSessionOutline(sessionId);
  if (!outline) notFound();

  // En aperçu formateur, les compteurs n'ont pas de sens : ils sont ceux d'un élève.
  const [unread, waiting] = access.role === "student"
    ? await Promise.all([
        unreadBySession(me.id, [sessionId]).then((m) => m.get(sessionId) ?? 0),
        countWaitingSlots({ sessionId, userId: me.id }),
      ])
    : [0, 0];

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:gap-10">
      <aside className="shrink-0 lg:w-64">
        <Link href="/espace" className="mb-3 block text-sm text-foreground-secondary hover:text-foreground">
          ← Mes formations
        </Link>
        <p className="mb-3 font-medium leading-snug">{outline.formationName}</p>
        <CourseOutline
          sessionId={sessionId}
          outline={outline}
          unreadMessages={unread}
          waitingDocuments={waiting}
        />
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
