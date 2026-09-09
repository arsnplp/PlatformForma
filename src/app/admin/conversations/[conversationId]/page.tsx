import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { checkConversationAccess, markConversationRead } from "@/lib/queries/conversations";
import { formatDate } from "@/lib/format";
import { SESSION_STATUS } from "@/lib/labels";
import { PageHeader } from "@/components/admin/page-header";
import { RefreshOnce } from "@/components/admin/refresh-once";
import { StatusBadge } from "@/components/admin/status-badge";
import { MessageThread } from "@/components/content/message-thread";

// Fil d'un élève, vu par son formateur (spec §5.8).
export default async function ConversationPage({ params }: PageProps<"/admin/conversations/[conversationId]">) {
  const { conversationId } = await params;
  const me = await requireUser(`/admin/conversations/${conversationId}`);
  if (!hasPermission(me, "can_manage_sessions")) redirect("/admin");

  const access = await checkConversationAccess(conversationId, me);
  // Volontairement 404 et non 403 : on ne révèle pas l'existence du fil.
  if (!access.allowed || access.role !== "trainer") notFound();

  const conversation = await prisma.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: {
      user: { select: { id: true, name: true, email: true } },
      session: {
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true,
          formationVersion: { select: { versionNumber: true, formation: { select: { name: true } } } },
        },
      },
    },
  });
  await markConversationRead(conversation.id, me.id);

  const s = conversation.session;
  const ss = SESSION_STATUS[s.status];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <RefreshOnce />
      <PageHeader
        breadcrumb={[
          { label: "Sessions", href: "/admin/sessions" },
          { label: s.name, href: `/admin/sessions/${s.id}` },
        ]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {conversation.user.name}
            <StatusBadge tone={ss.tone}>{ss.label}</StatusBadge>
          </span>
        }
      />

      <p className="text-sm text-foreground-secondary">
        <Link href={`/admin/eleves/${conversation.user.id}`} className="hover:underline">{conversation.user.email}</Link>
        {" · "}{s.formationVersion.formation.name} v{s.formationVersion.versionNumber}
        {" · "}du {formatDate(s.startDate)} au {formatDate(s.endDate)}
      </p>

      <MessageThread
        conversationId={conversation.id}
        viewerId={me.id}
        readOnly={s.status === "cancelled"}
        showDelivery
      />
    </div>
  );
}
