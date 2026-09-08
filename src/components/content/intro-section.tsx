import { prisma } from "@/lib/prisma";
import { BlockEditor, type EditorBlock } from "./block-editor";
import { BlockView } from "./block-view";
import { readText } from "@/lib/content/block-payload";

// Introduction de la formation : la page d'accueil, en tête de programme.
// Elle existe toujours — c'est sa PLACE qui est permanente, pas son contenu.
// Vidée, elle reste visible, prête à être remplie ; jamais elle ne disparaît.
export async function IntroSection({ versionId, editable }: { versionId: string; editable: boolean }) {
  const contentBlocks = await prisma.contentBlock.findMany({
    where: { formationVersionId: versionId },
    orderBy: { order: "asc" },
  });

  const blocks: EditorBlock[] = contentBlocks.map((b) => ({
    id: b.id,
    order: b.order,
    markdown: b.type === "text" ? readText(b.payload) : "",
    isText: b.type === "text",
  }));

  // Rendu côté serveur, comme pour une leçon : l'aperçu du formateur est
  // exactement ce que verra l'élève.
  const rendered = Object.fromEntries(
    contentBlocks.map((b) => [b.id, <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />]),
  );

  return (
    <section className="space-y-2 rounded-md border px-4 py-3">
      <div>
        <p className="font-medium">Introduction</p>
        <p className="text-xs text-foreground-tertiary">
          Ce que l&apos;élève lit en arrivant, avant le premier module : le mot d&apos;accueil, le
          déroulé jour par jour, le plan à télécharger.
        </p>
      </div>

      {editable ? (
        <BlockEditor
          target={{ formationVersionId: versionId }}
          blocks={blocks}
          rendered={rendered}
          emptyLabel="Pas encore d'introduction."
          emptyAction="Ajouter l'introduction"
        />
      ) : blocks.length === 0 ? (
        <p className="text-sm text-foreground-tertiary">Cette version n&apos;a pas d&apos;introduction.</p>
      ) : (
        <div className="max-w-content">
          {contentBlocks.map((b) => (
            <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />
          ))}
        </div>
      )}
    </section>
  );
}
