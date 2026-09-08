-- Classement de la pièce attendue : c'est lui qui range l'export ZIP, donc il
-- se décide à la création de l'emplacement, pas au dépôt.
ALTER TABLE "document_slots" ADD COLUMN "document_type" "DocumentType" NOT NULL DEFAULT 'autre';
ALTER TABLE "document_slots" ADD COLUMN "phase" INTEGER;
ALTER TABLE "document_slot_templates" ADD COLUMN "document_type" "DocumentType" NOT NULL DEFAULT 'autre';
ALTER TABLE "document_slot_templates" ADD COLUMN "phase" INTEGER;
