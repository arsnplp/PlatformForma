import { prisma } from "@/lib/prisma";
import { BlockView } from "./block-view";
import { IntroEditor } from "./intro-editor";
import { readText } from "@/lib/content/block-payload";

// Introduction de la formation : la page d'accueil, en tête de programme.
// Elle existe toujours — c'est sa PLACE qui est permanente, pas son contenu.
// Vidée, elle reste visible, prête à être remplie ; jamais elle ne disparaît.
export async function IntroSection({ versionId, editable }: { versionId: string; editable: boolean }) {
  const blocks = await prisma.contentBlock.findMany({
    where: { formationVersionId: versionId },
    orderBy: { order: "asc" },
  });

  // Le mot d'accueil est le premier bloc texte ; tout le reste est un fichier.
  const textBlock = blocks.find((b) => b.type === "text") ?? null;
  const fileBlocks = blocks.filter((b) => b.id !== textBlock?.id);

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
        <IntroEditor
          versionId={versionId}
          initialText={textBlock ? readText(textBlock.payload) : ""}
          files={fileBlocks.map((b) => ({
            id: b.id,
            // Rendu côté serveur : l'aperçu est exactement ce que verra l'élève.
            view: <BlockView block={{ id: b.id, type: b.type, payload: b.payload }} />,
          }))}
        />
      ) : blocks.length === 0 ? (
        <p className="text-sm text-foreground-tertiary">Cette version n&apos;a pas d&apos;introduction.</p>
      ) : (
        <div className="max-w-content">
          {blocks.map((b) => (
            <BlockView key={b.id} block={{ id: b.id, type: b.type, payload: b.payload }} />
          ))}
        </div>
      )}
    </section>
  );
}
