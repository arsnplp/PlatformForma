-- Bloc d'introduction : un bloc de contenu peut désormais pendre directement à
-- une version de formation (la page d'accueil, avant le premier module) au lieu
-- d'une leçon. Exactement l'un des deux, jamais les deux ni aucun.

ALTER TABLE "content_blocks" ALTER COLUMN "lesson_id" DROP NOT NULL;
ALTER TABLE "content_blocks" ADD COLUMN "formation_version_id" UUID;

ALTER TABLE "content_blocks"
  ADD CONSTRAINT "content_blocks_owner_check"
  CHECK (("lesson_id" IS NOT NULL) <> ("formation_version_id" IS NOT NULL));

ALTER TABLE "content_blocks"
  ADD CONSTRAINT "content_blocks_formation_version_id_fkey"
  FOREIGN KEY ("formation_version_id") REFERENCES "formation_versions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "content_blocks_formation_version_id_order_key"
  ON "content_blocks"("formation_version_id", "order");
