import { requireUser } from "@/lib/auth/session";
import { MARKDOWN_SAMPLE } from "@/lib/markdown/sample";
import { Prose } from "@/components/content/prose";
import { PageHeader } from "@/components/admin/page-header";

// Page de référence du rendu de contenu : elle sert à vérifier que tout ce que
// le Markdown doit couvrir s'affiche correctement, dans la largeur de lecture
// réelle de l'espace élève.
export default async function RenduPage() {
  await requireUser("/admin/rendu");
  return (
    <div className="space-y-8">
      <PageHeader
        title="Rendu du contenu"
        description="Référence visuelle : ce que verront les élèves. Mêmes styles dans l'éditeur et dans l'espace élève."
      />
      <article className="max-w-content">
        <Prose markdown={MARKDOWN_SAMPLE} />
      </article>
    </div>
  );
}
