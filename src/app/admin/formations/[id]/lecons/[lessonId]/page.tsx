import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, hasPermission } from "@/lib/auth/session";
import { isOwnerOrSupervisor } from "@/lib/auth/ownership";
import { BlockEditor, type EditorBlock } from "@/components/content/block-editor";
import { BlockView } from "@/components/content/block-view";
import { ExerciseList } from "@/components/content/exercise-list";
import { readText } from "@/lib/content/block-payload";
import { PageHeader } from "@/components/admin/page-header";
import { StatusBadge } from "@/components/admin/status-badge";

// Éditeur d'une leçon : pile de blocs réordonnables (spec §8.1).
// Le HTML de chaque bloc est rendu ici, côté serveur : l'aperçu du formateur
// est exactement ce que verra l'élève.
export default async function LessonPage({ params }: PageProps<"/admin/formations/[id]/lecons/[lessonId]">) {
  const { id, lessonId } = await params;
  const me = await requireUser(`/admin/formations/${id}/lecons/${lessonId}`);
  if (!hasPermission(me, "can_edit_formation")) redirect("/admin");

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      contentBlocks: { orderBy: { order: "asc" } },
      module: { include: { formationVersion: { include: { formation: true } }, lessons: { orderBy: { order: "asc" }, select: { id: true, order: true, title: true } } } },
    },
  });
  const version = lesson?.module.formationVersion;
  const formation = version?.formation;
  if (!lesson || !version || !formation || formation.id !== id || !isOwnerOrSupervisor(me, formation.ownerId)) notFound();

  const editable = version.status === "draft" && !formation.archivedAt;
  const backHref = `/admin/formations/${id}?v=${version.versionNumber}&tab=content`;

  const blocks: EditorBlock[] = lesson.contentBlocks.map((b) => ({
    id: b.id,
    order: b.order,
    markdown: b.type === "text" ? readText(b.payload) : "",
    isText: b.type === "text",
  }));

  // Chaque bloc est rendu ici, côté serveur, puis passé à l'éditeur : l'aperçu
  // du formateur est exactement ce que verra l'élève, médias compris.
  const rendered = Object.fromEntries(
    lesson.contentBlocks.map((b) => [b.id, <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />]),
  );

  const siblings = lesson.module.lessons;
  const position = siblings.findIndex((l) => l.id === lesson.id);
  const previous = position > 0 ? siblings[position - 1] : null;
  const next = position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null;

  return (
    <div className="space-y-8">
      <PageHeader
        breadcrumb={[
          { label: "Formations", href: "/admin/formations" },
          { label: formation.name, href: backHref },
        ]}
        title={
          <span className="flex items-center gap-3">
            {lesson.title}
            {!editable ? <StatusBadge tone="purple">Lecture seule</StatusBadge> : null}
          </span>
        }
        description={`${lesson.module.title} · v${version.versionNumber} · ${blocks.length} bloc(s)`}
      />

      {!editable ? (
        <p className="rounded-md bg-surface px-3 py-2 text-sm text-foreground-secondary">
          {formation.archivedAt ? "Formation archivée" : `Version ${version.status === "active" ? "active" : "remplacée"}`} :
          le contenu est gelé. Pour le modifier, crée une nouvelle version.
        </p>
      ) : null}

      <article className="max-w-content">
        {editable ? (
          <BlockEditor lessonId={lesson.id} blocks={blocks} rendered={rendered} />
        ) : blocks.length === 0 ? (
          <p className="text-sm text-foreground-tertiary">Cette leçon ne contient aucun bloc.</p>
        ) : (
          <div className="space-y-1">
            {lesson.contentBlocks.map((b) => (
              <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />
            ))}
          </div>
        )}
      </article>

      <ExerciseList formationId={id} lessonId={lesson.id} editable={editable} />

      <nav className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
        {previous ? (
          <Link href={`/admin/formations/${id}/lecons/${previous.id}`} className="text-foreground-secondary hover:text-foreground">
            ← {previous.order}. {previous.title}
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/admin/formations/${id}/lecons/${next.id}`} className="ml-auto text-foreground-secondary hover:text-foreground">
            {next.order}. {next.title} →
          </Link>
        ) : null}
      </nav>
    </div>
  );
}
