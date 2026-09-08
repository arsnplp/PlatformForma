-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'signed', 'absent', 'unsigned');

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'present';

-- ─── La feuille de groupe n'a pas de titulaire individuel ─────────────────────
-- Une feuille d'émargement appartient à la session, pas à un élève (elle porte
-- tout le groupe) ni à l'entreprise. On assouplit donc la règle : AU PLUS un
-- titulaire ; si aucun, la pièce doit être rattachée à une session ou à une
-- formation. Une pièce sans aucun rattachement reste impossible.
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_one_holder;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_one_holder
  CHECK (
    NOT (owner_user_id IS NOT NULL AND company_id IS NOT NULL)
    AND (
      owner_user_id IS NOT NULL
      OR company_id IS NOT NULL
      OR session_id IS NOT NULL
      OR formation_id IS NOT NULL
    )
  );
