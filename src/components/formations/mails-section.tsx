import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { applyDefaultTemplates, removeMessageTemplate } from "@/lib/actions/message-templates";
import { inspectVariables } from "@/lib/messages/variables";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { DEFAULT_TEMPLATES } from "@/lib/messages/default-templates";

// Onglet « Mails » d'une version : templates de messages (spec §5.6).
// Éditable sur un brouillon, gelé une fois la version publiée.
export async function MailsSection({
  formationId,
  versionId,
  versionNumber,
  editable,
}: {
  formationId: string;
  versionId: string;
  versionNumber: number;
  editable: boolean;
}) {
  const templates = await prisma.messageTemplate.findMany({
    where: { formationVersionId: versionId, archivedAt: null },
    orderBy: { createdAt: "asc" },
  });

  if (templates.length === 0) {
    return (
      <div className="space-y-4 px-5 py-6 text-sm">
        <p className="text-foreground-secondary">Aucun template de mail dans cette version.</p>
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <form action={applyDefaultTemplates.bind(null, versionId)}>
              <Button type="submit" variant="outline">Ajouter les {DEFAULT_TEMPLATES.length} mails par défaut</Button>
            </form>
            <Button asChild variant="outline">
              <Link href={`/admin/formations/${formationId}/mails/nouveau?v=${versionNumber}`}>Nouveau template</Link>
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-foreground-secondary">
          {templates.length} template(s){!editable ? " · gelés (version publiée)" : ""}
        </p>
        {editable ? (
          <div className="flex gap-2">
            <form action={applyDefaultTemplates.bind(null, versionId)}>
              <Button type="submit" variant="ghost" size="sm">Compléter avec les mails par défaut</Button>
            </form>
            <Button asChild variant="outline" size="sm">
              <Link href={`/admin/formations/${formationId}/mails/nouveau?v=${versionNumber}`}>Nouveau template</Link>
            </Button>
          </div>
        ) : null}
      </div>

      <ol className="divide-y rounded-md border">
        {templates.map((t) => {
          const vars = new Set([...inspectVariables(t.subject).used, ...inspectVariables(t.body).used]);
          const excerpt = t.body.replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim().slice(0, 120);
          return (
            <li key={t.id} className="flex items-start gap-3 px-3 py-3 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-foreground-secondary">
                  <span className="text-foreground-tertiary">Objet : </span>{t.subject}
                </p>
                <p className="mt-1 truncate text-xs text-foreground-tertiary">{excerpt}…</p>
                {vars.size > 0 ? (
                  <p className="mt-1 font-mono text-[11px] text-foreground-tertiary">{[...vars].map((v) => `{{${v}}}`).join(" ")}</p>
                ) : null}
              </div>
              {editable ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button asChild variant="ghost" size="sm" className="h-7">
                    <Link href={`/admin/formations/${formationId}/mails/${t.id}?v=${versionNumber}`}>Modifier</Link>
                  </Button>
                  <ConfirmButton
                    action={removeMessageTemplate.bind(null, t.id)}
                    title={`Supprimer « ${t.name} » ?`}
                    description="Uniquement sur ce brouillon : les versions publiées et les sessions en cours gardent leurs templates."
                    confirmLabel="Supprimer"
                    variant="ghost"
                  >
                    Supprimer
                  </ConfirmButton>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
