-- Contact entreprise : le dirigeant ou le RH qui suit le dossier de sa société.
-- Aucune permission — il n'accède ni au back-office, ni aux dossiers d'élèves.
-- Son périmètre tient dans son rattachement (users.company_id), pas dans un droit.
INSERT INTO "roles" ("id", "key", "label", "created_at")
VALUES (gen_random_uuid(), 'entreprise', 'Contact entreprise', now())
ON CONFLICT ("key") DO NOTHING;
