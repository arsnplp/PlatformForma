import { renderMarkdown } from "@/lib/markdown/render";
import { cn } from "@/lib/utils";

// Rendu de contenu partagé : back-office (aperçu formateur) et espace élève
// affichent exactement la même chose (spec §3.2).
export async function Prose({ markdown, className }: { markdown: string; className?: string }) {
  const html = await renderMarkdown(markdown);
  return <div className={cn("prose-app", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
