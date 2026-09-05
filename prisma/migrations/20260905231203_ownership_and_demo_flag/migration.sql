/*
  Warnings:

  - Added the required column `owner_id` to the `companies` table without a default value. This is not possible if the table is not empty.
  - Added the required column `owner_id` to the `formations` table without a default value. This is not possible if the table is not empty.
  - Made the column `owner_id` on table `prospects` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `owner_id` to the `sessions` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "activity_logs" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "owner_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "enrollments" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "formations" ADD COLUMN     "owner_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "prospects" ALTER COLUMN "owner_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "owner_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "submissions" ADD COLUMN     "is_demo" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "companies_owner_id_idx" ON "companies"("owner_id");

-- CreateIndex
CREATE INDEX "formations_owner_id_idx" ON "formations"("owner_id");

-- CreateIndex
CREATE INDEX "prospects_owner_id_idx" ON "prospects"("owner_id");

-- CreateIndex
CREATE INDEX "sessions_owner_id_idx" ON "sessions"("owner_id");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formations" ADD CONSTRAINT "formations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════════
-- RLS : cloisonnement par propriétaire (owner_id)
--   • Un formateur voit ses lignes (owner_id = lui) et les sessions qu'il anime.
--   • can_view_all_dossiers voit tout (supervision, super-admin).
--   • Les policies existantes sont modifiées par ALTER POLICY (mêmes noms).
-- ═════════════════════════════════════════════════════════════════════════════

-- « Gère la session » : propriétaire OU formateur animateur.
CREATE OR REPLACE FUNCTION public.app_manages_session(p_session uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.id = p_session
      AND (s.owner_id = public.app_current_user_id()
           OR s.trainer_id = public.app_current_user_id())
  );
END;
$$;

-- Contenu d'une version : admin, propriétaire de la formation, formateur/propriétaire
-- d'une session sur cette version, ou élève inscrit à une telle session.
CREATE OR REPLACE FUNCTION public.app_can_read_version(p_version uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.app_sees_everything() THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.formation_versions v
    JOIN public.formations f ON f.id = v.formation_id
    WHERE v.id = p_version AND f.owner_id = public.app_current_user_id()
  ) THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1
    FROM public.sessions s
    LEFT JOIN public.enrollments e ON e.session_id = s.id
    WHERE s.formation_version_id = p_version
      AND (s.owner_id = public.app_current_user_id()
           OR s.trainer_id = public.app_current_user_id()
           OR e.user_id = public.app_current_user_id())
  );
END;
$$;

-- Process d'une version : admin, propriétaire de la formation, ou formateur/propriétaire
-- d'une session sur cette version. Jamais les élèves.
CREATE OR REPLACE FUNCTION public.app_can_read_version_process(p_version uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.app_sees_everything() THEN RETURN true; END IF;
  IF EXISTS (
    SELECT 1 FROM public.formation_versions v
    JOIN public.formations f ON f.id = v.formation_id
    WHERE v.id = p_version AND f.owner_id = public.app_current_user_id()
  ) THEN RETURN true; END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.formation_version_id = p_version
      AND (s.owner_id = public.app_current_user_id()
           OR s.trainer_id = public.app_current_user_id())
  );
END;
$$;

-- Identité : un formateur voit les élèves inscrits aux sessions qu'il gère.
ALTER POLICY users_select ON public.users USING (
  id = public.app_current_user_id()
  OR public.app_sees_everything()
  OR public.app_has_permission('can_manage_users')
  OR EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.user_id = users.id AND public.app_manages_session(e.session_id)
  )
);

-- CRM : propriétaire, ou formateur d'une session de l'entreprise.
ALTER POLICY companies_select ON public.companies USING (
  public.app_sees_everything()
  OR owner_id = public.app_current_user_id()
  OR EXISTS (
    SELECT 1 FROM public.sessions s
    WHERE s.company_id = companies.id AND public.app_manages_session(s.id)
  )
);
ALTER POLICY prospects_select ON public.prospects USING (
  public.app_sees_everything()
  OR owner_id = public.app_current_user_id()
);

-- Modèle : propriétaire de la formation (les tables filles passent par app_can_read_version).
ALTER POLICY formations_select ON public.formations USING (
  public.app_sees_everything()
  OR owner_id = public.app_current_user_id()
  OR EXISTS (
    SELECT 1 FROM public.formation_versions v
    WHERE v.formation_id = formations.id AND public.app_can_read_version(v.id)
  )
);

-- Vécu : propriétaire ou animateur de la session (app_manages_session), élève pour ses lignes.
ALTER POLICY sessions_select ON public.sessions USING (
  public.app_sees_everything()
  OR owner_id = public.app_current_user_id()
  OR trainer_id = public.app_current_user_id()
  OR public.app_is_enrolled_in(id)
);
ALTER POLICY enrollments_select ON public.enrollments USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_manages_session(session_id)
);
ALTER POLICY step_instances_select ON public.step_instances USING (
  public.app_sees_everything()
  OR public.app_manages_session(session_id)
);
ALTER POLICY documents_select ON public.documents USING (
  public.app_sees_everything()
  OR owner_user_id = public.app_current_user_id()
  OR (session_id IS NOT NULL AND public.app_manages_session(session_id))
  OR (company_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = documents.company_id AND c.owner_id = public.app_current_user_id()))
);
ALTER POLICY attendances_select ON public.attendances USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_manages_session(session_id)
);
ALTER POLICY conversations_select ON public.conversations USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_manages_session(session_id)
);
ALTER POLICY messages_select ON public.messages USING (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = messages.conversation_id
      AND (public.app_sees_everything()
           OR c.user_id = public.app_current_user_id()
           OR public.app_manages_session(c.session_id))
  )
);
ALTER POLICY submissions_select ON public.submissions USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_manages_session(session_id)
);
ALTER POLICY activity_logs_select ON public.activity_logs USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_manages_session(session_id)
);
ALTER POLICY time_aggregates_select ON public.time_aggregates USING (
  public.app_sees_everything()
  OR user_id = public.app_current_user_id()
  OR public.app_manages_session(session_id)
);
