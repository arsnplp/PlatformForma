-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "notified_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "conversation_reads" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3),
    "notified_at" TIMESTAMP(3),

    CONSTRAINT "conversation_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversation_reads_user_id_idx" ON "conversation_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_reads_conversation_id_user_id_key" ON "conversation_reads"("conversation_id", "user_id");

-- CreateIndex
CREATE INDEX "messages_notified_at_sent_at_idx" ON "messages"("notified_at", "sent_at");

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── RLS ──────────────────────────────────────────────────────────────────────
-- Même règle que le fil lui-même : chacun ne voit que ses propres marqueurs de
-- lecture. Aucune policy d'écriture : Prisma (rôle postgres) contourne le RLS,
-- les écritures restent gardées côté application.
ALTER TABLE public.conversation_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversation_reads_select ON public.conversation_reads FOR SELECT TO authenticated USING (
  user_id = public.app_current_user_id()
  OR public.app_sees_everything()
);
