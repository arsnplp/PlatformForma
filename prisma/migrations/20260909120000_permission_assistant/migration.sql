-- Droit d'utiliser l'assistant du back-office. C'est une permission, pas un
-- rôle en dur : on l'ouvrira aux formateurs sans toucher au code.
INSERT INTO "permissions" ("id", "key", "description", "created_at")
VALUES (gen_random_uuid(), 'can_use_assistant',
        'Utiliser l''assistant : interroger ses données et agir en son nom', now())
ON CONFLICT ("key") DO NOTHING;

-- Le super-administrateur seul, pour l'instant.
INSERT INTO "role_permissions" ("role_id", "permission_id")
SELECT r."id", p."id"
FROM "roles" r, "permissions" p
WHERE r."key" = 'super_admin' AND p."key" = 'can_use_assistant'
ON CONFLICT DO NOTHING;
