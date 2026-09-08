-- AlterEnum
ALTER TYPE "ContentBlockType" ADD VALUE 'visio';

-- AlterTable
ALTER TABLE "attendances" ADD COLUMN     "seance_id" UUID;

-- CreateTable
CREATE TABLE "seances" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "content_block_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "join_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seances_session_id_starts_at_idx" ON "seances"("session_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "seances_session_id_content_block_id_key" ON "seances"("session_id", "content_block_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_seance_id_user_id_key" ON "attendances"("seance_id", "user_id");

-- AddForeignKey
ALTER TABLE "seances" ADD CONSTRAINT "seances_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seances" ADD CONSTRAINT "seances_content_block_id_fkey" FOREIGN KEY ("content_block_id") REFERENCES "content_blocks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_seance_id_fkey" FOREIGN KEY ("seance_id") REFERENCES "seances"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Une séance est lisible par l'encadrement de la session et par ses inscrits :
-- c'est le rendez-vous auquel l'élève doit se rendre.
ALTER TABLE public.seances ENABLE ROW LEVEL SECURITY;

CREATE POLICY seances_select ON public.seances FOR SELECT TO authenticated USING (
  public.app_sees_everything()
  OR public.app_is_trainer_of(session_id)
  OR public.app_is_enrolled_in(session_id)
);
