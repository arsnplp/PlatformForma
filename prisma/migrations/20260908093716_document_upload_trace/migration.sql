-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "archived_at" TIMESTAMP(3),
ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "uploaded_by_id" UUID;

-- CreateIndex
CREATE INDEX "documents_formation_id_idx" ON "documents"("formation_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Un document a exactement un titulaire ────────────────────────────────────
-- Soit un élève (son contrat, son attestation), soit une entreprise (convention,
-- facture) : jamais les deux, jamais aucun. C'est cette ligne qui sépare ce
-- qu'un élève peut voir de ce qui ne le regarde pas, elle est donc garantie en
-- base et pas seulement dans le code.
ALTER TABLE public.documents
  ADD CONSTRAINT documents_one_holder
  CHECK ((owner_user_id IS NOT NULL) <> (company_id IS NOT NULL));
