-- CreateEnum
CREATE TYPE "DocumentSlotKind" AS ENUM ('to_provide', 'to_sign');

-- CreateTable
CREATE TABLE "document_slots" (
    "id" UUID NOT NULL,
    "kind" "DocumentSlotKind" NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "due_date" DATE,
    "order" INTEGER NOT NULL DEFAULT 0,
    "user_id" UUID,
    "session_id" UUID,
    "company_id" UUID,
    "document_id" UUID,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "document_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_slot_templates" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "DocumentSlotKind" NOT NULL,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "document_slot_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_slot_groups" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "document_slot_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_slot_group_items" (
    "id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "document_slot_group_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_slots_document_id_key" ON "document_slots"("document_id");

-- CreateIndex
CREATE INDEX "document_slots_user_id_session_id_idx" ON "document_slots"("user_id", "session_id");

-- CreateIndex
CREATE INDEX "document_slots_company_id_idx" ON "document_slots"("company_id");

-- CreateIndex
CREATE INDEX "document_slot_templates_owner_id_idx" ON "document_slot_templates"("owner_id");

-- CreateIndex
CREATE INDEX "document_slot_groups_owner_id_idx" ON "document_slot_groups"("owner_id");

-- CreateIndex
CREATE INDEX "document_slot_group_items_template_id_idx" ON "document_slot_group_items"("template_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_slot_group_items_group_id_order_key" ON "document_slot_group_items"("group_id", "order");

-- AddForeignKey
ALTER TABLE "document_slots" ADD CONSTRAINT "document_slots_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slots" ADD CONSTRAINT "document_slots_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slots" ADD CONSTRAINT "document_slots_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slots" ADD CONSTRAINT "document_slots_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slots" ADD CONSTRAINT "document_slots_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slot_templates" ADD CONSTRAINT "document_slot_templates_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slot_groups" ADD CONSTRAINT "document_slot_groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slot_group_items" ADD CONSTRAINT "document_slot_group_items_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "document_slot_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_slot_group_items" ADD CONSTRAINT "document_slot_group_items_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_slot_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Un emplacement a un titulaire et un seul : un élève (avec sa session) ou une
-- entreprise. Garanti en base, pas seulement dans le code.
ALTER TABLE "document_slots"
  ADD CONSTRAINT "document_slots_holder_check"
  CHECK (("user_id" IS NOT NULL AND "session_id" IS NOT NULL AND "company_id" IS NULL)
      OR ("company_id" IS NOT NULL AND "user_id" IS NULL AND "session_id" IS NULL));
