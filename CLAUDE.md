@AGENTS.md

# Plateforme de formation — règles du projet

Source de vérité : `spec-plateforme-formation.md` à la racine. En cas de doute, la spec gagne. Si une info manque ou qu'une décision est ambiguë, **s'arrêter et demander** plutôt que deviner.

## Principe directeur

> **Tout ce qui a été « vécu » par un élève est immuable. Tout ce qui est « modèle » est versionné.**

- *Vécu / gelé pour toujours* : Session, Enrollment, émargement signé, document signé, soumission d'exercice, log de temps. On ne modifie ni ne supprime jamais.
- *Modèle / versionné* : Formation, son contenu (modules, leçons, blocs, exos), son process, ses templates de mails. Toute modification crée une nouvelle `FormationVersion` avec `changelog` ; les anciennes versions restent consultables.

Ce principe gouverne le versioning, le soft-delete et la conformité audit (Qualiopi / OPCO / RGPD).

## Les 7 pièges à éviter (spec §14)

1. **Jamais de rôles en dur** → rôles et permissions granulaires en base (`Role`, `Permission`, `RolePermission`, `UserRole`) + RLS Postgres. Le « super-admin qui promeut » = simple possession de `can_grant_admin`.
2. **Séparer Formation (modèle) / Session (instance)** dès le début.
3. **Session pointe vers une `FormationVersion`**, jamais vers la Formation.
4. **Soft-delete (`archivedAt`) + `onDelete: Restrict` partout** → un dossier élève est indestructible et tient debout même formation archivée. Aucun `DELETE` physique, aucune cascade.
5. **Figer le process (`process_snapshot_json`)** au démarrage de chaque session : modifier le process ensuite n'affecte pas les sessions en cours.
6. **Heartbeat + détection d'inactivité** pour des temps de connexion fiables (sinon inutilisables en audit).
7. **ZIP streamé** (`archiver`), jamais tout en mémoire ; gros exports en tâche de fond ; chaque export loggé dans `AccessLog`.

## Sécurité (spec §4)

- Auth Supabase (email/mot de passe). Permissions vérifiées côté serveur ET par policies RLS : élève = ses données uniquement, formateur = ses sessions, super-admin = tout.
- Fichiers via Supabase Storage avec URLs signées, jamais publics.
- `SUPABASE_SERVICE_ROLE_KEY` : serveur uniquement, jamais dans du code client ni dans un commit.
- **Toute Server Action qui écrit en base DOIT appeler `requirePermission(...)` (`src/lib/auth/session.ts`) AVANT la moindre écriture, puis `assertOwnerOrSupervisor(...)` (`src/lib/auth/ownership.ts`) sur toute ligne possédée (Company, Prospect, Formation, Session). Les listes filtrent par `ownerFilter(me)`. À la création, `ownerId` = utilisateur courant.** Il n'existe aucune policy RLS d'écriture et Prisma (rôle `postgres`) contourne le RLS : cette vérification est la seule barrière. Le code ne teste jamais un rôle, uniquement des permissions.

## Design (spec §3) — sobriété façon Notion

- **Ultra-clair, épuré** : espace blanc, hiérarchie par la typographie plutôt que par bordures et couleurs. Zéro surcharge, pas d'ombres lourdes ni de dégradés.
- **Palette** : fond blanc / gris très clair, texte quasi-noir `#37352F`, gris moyens pour le secondaire, **une seule** couleur d'accent discrète. Les couleurs ne servent qu'au sens (statuts, tags), jamais à la décoration.
- **Typographie** : sans-serif nette (Inter / police système), interlignage généreux, largeur de lecture limitée.
- **Design tokens uniques** (couleurs, échelle typo, espacements) centralisés et branchés sur Tailwind ; composants shadcn/ui (Radix) restylés sur ces tokens. **Un seul design system** partagé back-office + espace élève.
- **Markdown parfait** : titres, gras/italique/barré, listes imbriquées, cases à cocher, citations, code avec coloration syntaxique (Shiki/Prism), tables, liens, images, séparateurs, callouts. Édition par blocs (BlockNote ou équivalent) : drag & drop, menu « / », WYSIWYG identique au rendu élève.

## Déploiement

`DEPLOIEMENT.md` liste tout ce qui reste à régler avant la mise en production.
**Le tenir à jour** : dès qu'un palier introduit une variable d'environnement, un
secret, une tâche planifiée ou une bascule manuelle, ajouter la ligne correspondante.

## Méthode de travail — palier par palier (spec §13)

- On avance **palier par palier** (1 Fondations → 2 Moteur de checklist → 3 Automatisation → 4 Espace élève → 5 Signature + GED → 6 Visio → 7 Logs & analytics). Chaque palier livre un outil utilisable.
- **Un palier = un commit propre.** On ne passe au suivant qu'après validation explicite de l'utilisateur.
- À l'intérieur d'un palier : étape par étape, montrer le résultat avant d'enchaîner.
- Ne coder aucune feature hors du palier en cours.

## Stack & conventions techniques

- Next.js 16 (App Router, TypeScript, `src/`), Tailwind v4, Prisma 7 (`prisma.config.ts` porte l'URL CLI, le client est généré dans `src/generated/prisma`), Supabase (Postgres, Auth, Storage, RLS).
- `DATABASE_URL` = pooler port 6543 (`?pgbouncer=true`), utilisée par le PrismaClient au runtime (driver adapter) ; `DIRECT_URL` = port 5432, utilisée par la CLI Prisma (migrations) via `prisma.config.ts`. Prisma 7 n'a plus de `directUrl` : c'est cette séparation qui en tient lieu.
- Enums Prisma pour tous les champs à valeurs fixes. Toutes les relations en `onDelete: Restrict`.
- **Fuseau horaire des échéances** : `Session.startDate/endDate` et `StepInstance.dueDate` sont des dates civiles (`@db.Date`) manipulées en UTC (`setUTCDate`). Au Palier 3, le cron qui déclenchera les envois automatiques DOIT raisonner en heure de Paris (`Europe/Paris`) pour comparer « aujourd'hui » à ces dates, sinon une convocation J-7 partirait la veille au soir.
- Ne jamais committer `.env` ni aucun secret (`.gitignore` couvre `.env` et `.env*`, seul `.env.example` est versionné).
