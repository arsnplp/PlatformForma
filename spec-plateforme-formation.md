# Plateforme de formation — Document de conception

**Version du document :** 1.0
**Contexte :** LMS + back-office de conformité Qualiopi/OPCO pour formations à distance (FOAD)
**Stack cible :** Next.js (App Router, TypeScript) + Supabase (Postgres/Auth/Storage) sur VPS Hostinger

---

## 1. Vision d'ensemble

La plateforme est en réalité **trois produits imbriqués** :

1. **LMS** (côté élève) — leçons, exercices, visios, émargements, temps passé.
2. **Moteur de process configurable** (côté équipe) — la checklist 7 phases automatisée, éditable sans code, différente par formation/secteur.
3. **GED + signature + messagerie** — contrats, docs, conversations liées à chaque formation, export dossier de preuve.

### Principe directeur (à retenir avant tout)

> **Tout ce qui a été « vécu » par un élève est immuable. Tout ce qui est « modèle » est versionné.**

- *Vécu / gelé pour toujours* : une session, un émargement signé, un doc signé, une soumission d'exo, un log de temps.
- *Modèle / versionné* : une formation, son contenu, son process, ses templates de mails. L'ancienne version reste toujours consultable.

Ce principe gouverne le versioning, le soft-delete et la conformité audit.

---

## 2. Décisions d'architecture

| Sujet | Décision | Raison |
|---|---|---|
| Hébergement | VPS Hostinger, Docker + Caddy (reverse proxy + HTTPS auto) | Accès root, fait tourner Node/Next.js en continu |
| Base de données | Supabase (Postgres managé) | Auth + Storage + RLS + pg_cron dans un seul service |
| ORM | Prisma | Modèle relationnel = cœur du produit |
| Auth | Supabase Auth + table `roles`/`permissions` + RLS | Multi-rôle sûr au niveau BDD |
| Fichiers / GED | Supabase Storage (URLs signées) | Respecte le RLS, pas de fichiers publics |
| Emails transactionnels | Resend (templates React Email) | Délivrabilité + DX |
| Signature électronique | Yousign (API française, eIDAS) | Émargement légal + contrats Qualiopi |
| Visio | Google Calendar API → event + lien Meet auto | Déjà connecté, zéro coût |
| Tâches planifiées | pg_cron (Supabase) ou cron VPS | Déclenche les étapes temporelles (J-7, J+90…) |
| Suppression | **Soft-delete uniquement** (`archived_at`) + `onDelete: Restrict` | Ne jamais casser un dossier élève |

---

## 3. Design & expérience utilisateur (façon Notion)

**Objectif de design : Notion.** Interface ultra-claire, minimaliste, où le contenu prime sur l'habillage. Même philosophie visuelle, même sobriété, même rendu Markdown.

### 3.1 Direction visuelle

- **Ultra-clair et épuré** : beaucoup d'espace blanc, hiérarchie par la typographie (tailles/graisses) plutôt que par des bordures et des couleurs. Zéro surcharge.
- **Palette Notion** : fond blanc / gris très clair, texte quasi-noir (`#37352F` chez Notion), gris moyens pour le secondaire, couleur d'accent unique et discrète. Les couleurs ne servent qu'au sens (statuts, tags), jamais à la décoration.
- **Typographie** : une sans-serif nette et lisible (type Inter / la police système), interlignage généreux, largeur de lecture limitée.
- **Composants sobres** : boutons discrets, séparateurs légers, coins arrondis doux, transitions subtiles. Pas d'ombres lourdes ni de dégradés.
- **Cohérence totale** : les **mêmes couleurs, la même échelle typographique, les mêmes espacements partout** (design tokens uniques), côté équipe comme côté élève.

### 3.2 Rendu Markdown « parfait » (au niveau de Notion)

Le contenu (leçons, énoncés d'exos, messages) doit gérer le Markdown **impeccablement**, comme Notion :

- Support complet : titres, gras/italique/barré, listes à puces et numérotées imbriquées, cases à cocher, citations, blocs de code avec **coloration syntaxique**, tables, liens, images, séparateurs, callouts.
- **Édition par blocs façon Notion** : chaque bloc est réordonnable par glisser-déposer ; menu « / » (slash command) pour insérer un type de bloc ; le rendu à l'écran est identique à ce que verra l'élève (WYSIWYG).
- Rendu de lecture **propre et fidèle** : même sobriété, mêmes marges, même typographie que l'éditeur.

### 3.3 Implémentation recommandée

- **Design tokens** centralisés (couleurs, tailles, espacements) + **Tailwind CSS** configuré sur ces tokens → cohérence garantie et rapidité de dev.
- **Composants** : shadcn/ui (Radix) pour une base accessible et sobre, restylée aux tokens Notion.
- **Éditeur de blocs / Markdown** : une lib d'éditeur riche type **BlockNote**, **Tiptap** ou **Editor.js** (BlockNote donne d'emblée l'expérience « blocs + slash + Markdown » la plus proche de Notion). Coloration de code via Shiki/Prism.
- **Un seul système de design** partagé entre le back-office et l'espace élève → l'élève retrouve la même clarté que toi.

---

## 4. Rôles et permissions

**Ne jamais coder les rôles en dur.** On utilise des permissions granulaires, sinon ajouter « super-admin qui promeut » devient ingérable.

### Rôles

| Rôle | Portée |
|---|---|
| **Super Admin** (toi) | Tout + édition des process/templates + **peut promouvoir un formateur en super-admin** |
| **Formateur** | Ses sessions : contenu, correction d'exos, visios, dossiers de ses élèves |
| **Élève** | Uniquement SES formations et SON propre dossier |

### Permissions (exemples)

`can_grant_admin`, `can_edit_process_template`, `can_edit_formation`, `can_correct_exercises`, `can_view_all_dossiers`, `can_export_dossier`, `can_manage_users`, `can_manage_visio`…

Le « super-admin qui promeut » = un super-admin qui possède `can_grant_admin`. Simple attribution de permission, aucune logique en dur.

### Sécurité : Row Level Security (RLS)

Règle écrite une fois, appliquée partout, garantie au niveau base :
- un élève ne peut charger QUE ses propres enrollments/docs/logs ;
- un formateur voit les sessions auxquelles il est rattaché ;
- un super-admin voit tout.

Même une erreur dans une requête front ne peut pas fuiter le doc d'un autre élève.

---

## 5. Modèle de données complet

### 5.1 Identité & rôles

```
User            (id, email, name, created_at, archived_at)
Role            (id, key)                    -- super_admin, formateur, eleve
Permission      (id, key)
RolePermission  (role_id, permission_id)
UserRole        (user_id, role_id)
AccessLog       (id, user_id, action, target_type, target_id, at)  -- journal d'accès (audit RGPD)
```

### 5.2 CRM / commercial

```
Company         (id, name, siret, sector, contact_name, contact_email, ...)
Prospect        (id, company_id, status, first_call_at, notes, owner_id)   -- phase 0
```

### 5.3 Formation & VERSIONING (cœur)

```
Formation           (id, name, sector, archived_at)          -- identité stable
FormationVersion    (id, formation_id, version_number,
                     status[draft|active|archived],
                     changelog,                               -- résumé des modifs vs version précédente
                     published_at, created_by)
```

- **Une Formation** = l'identité stable (« Formation IA — BTP »).
- **Une FormationVersion** = le contenu + process figés à l'instant T.
- Modifier une formation **ne remplace rien** : ça crée une nouvelle version (v2, v3…). Les anciennes restent gelées.
- Le `secteur` est un attribut de la Formation → filtrage et duplication par secteur.

### 5.4 Contenu pédagogique (arbre de blocs)

```
Module          (id, formation_version_id, order, title)
Lesson          (id, module_id, order, title)
ContentBlock    (id, lesson_id, order, type, payload_json)
                -- type: text | image | video | pdf | embed | callout | quiz_ref | exercise_ref
Exercise        (id, module_id | lesson_id, order, type, title,
                 statement, config_json, max_score, correction_mode)
                -- type: qcm | true_false | short_answer | long_text | file_upload | quiz
                -- correction_mode: auto | manual
```

> **Facilité de création :** une leçon = une pile de `ContentBlock` réordonnables (modèle Notion). Un exo = un `type` + un formulaire de config. Voir §7.

### 5.5 Session (instance vécue — immuable)

```
Session         (id, formation_version_id,     -- pointe vers une VERSION précise (gelée)
                 company_id, name,
                 start_date, end_date,
                 status[planned|running|done|cancelled],
                 process_snapshot_json,          -- process figé au démarrage
                 trainer_id)
Enrollment      (id, session_id, user_id,
                 status[active|completed|dropped],
                 enrolled_at, completed_at)      -- jamais supprimé
```

- Une Session pointe vers une **FormationVersion**, pas vers la Formation → l'audit voit exactement le programme suivi.
- `process_snapshot_json` : le process (7 phases + mails) est **figé** au démarrage de la session. Modifier le process plus tard n'affecte pas les sessions en cours.

### 5.6 Moteur de process configurable

```
ProcessTemplate (id, formation_version_id, name)
StepTemplate    (id, process_template_id, order, phase, name,
                 assignee,                       -- Arsène | Fatima | rôle
                 trigger_type,                   -- manual | time_offset | event
                 trigger_anchor,                 -- start_date | end_date | signature | ...
                 trigger_offset_days,            -- ex: -7, +90
                 action_type,                    -- send_message | request_signature |
                                                 --   unlock_content | create_visio | checklist_only
                 action_params_json)
StepInstance    (id, session_id, step_template_id,
                 status[pending|done|skipped],
                 due_date, done_at, done_by)     -- la checklist réelle d'une session
MessageTemplate (id, formation_version_id, name, subject, body, attachments_json)
```

### 5.7 Documents / GED & signature

```
Document        (id,
                 owner_user_id,                  -- l'élève (ou null si doc entreprise)
                 company_id, session_id, formation_id,
                 type,                           -- contrat|convention|convocation|
                                                 --   emargement|attestation|eval|facture|...
                 phase,                          -- rattachement au process
                 storage_path,                   -- Supabase Storage
                 signature_status[na|pending|signed],
                 signature_provider_id,          -- id Yousign
                 created_at, retention_until)     -- date de purge RGPD
Attendance      (id, session_id, user_id, day, slot[am|pm],
                 signed_at, document_id)          -- 18 émargements = 9 jours × 2
```

- `onDelete: Restrict` partout : impossible de supprimer une formation/session qui a des docs.
- Un `Document` est **autonome** : il survit à l'archivage de la formation.

### 5.8 Messagerie

```
Conversation    (id, session_id, user_id)        -- 1 fil par élève × session
Message         (id, conversation_id, sender_id, body, attachments_json, sent_at,
                 auto_generated)                  -- true si envoyé par le moteur de process
```

### 5.9 Exercices — soumissions & correction

```
Submission      (id, exercise_id, user_id, session_id,
                 content_json,                   -- réponses / fichier uploadé
                 auto_score, manual_score,
                 feedback,                        -- retour individuel du formateur
                 status[submitted|graded],
                 submitted_at, graded_at, graded_by)
```

### 5.10 Logs de temps passé (suivi + preuve FOAD)

```
ActivityLog     (id, user_id, session_id,
                 module_id, lesson_id, exercise_id, document_id,
                 event_type,                     -- lesson_open|lesson_close|
                                                 --   exercise_start|exercise_submit|
                                                 --   doc_open|heartbeat
                 at, duration_seconds)
TimeAggregate   (id, user_id, session_id, scope_type, scope_id, day, total_seconds)
                -- pré-calcul pour les relevés d'assiduité
```

---

## 6. Le moteur de process — fonctionnement

### 6.1 Trois types de déclencheurs

| Type | Exemple checklist | Mécanisme |
|---|---|---|
| **manual** | « Premier call effectué », « Contrat signé » | Coché par Arsène/Fatima |
| **time_offset** | « Convocation J-7 », « Enquête à froid J+90 » | `due_date = anchor ± offset`, scanné par le cron |
| **event** | « Accord OPCO reçu → fixer les dates » | Déclenché quand un événement survient |

### 6.2 Types d'actions

- `send_message` — envoie un `MessageTemplate` + pièces jointes (Resend) et poste dans la conversation élève.
- `request_signature` — crée une demande Yousign, met le `Document` en `pending`.
- `unlock_content` — débloque un module/leçon pour l'élève.
- `create_visio` — crée l'event Google Meet et envoie le lien.
- `checklist_only` — simple case à cocher, pas d'action.

### 6.3 Cycle de vie

1. Entreprise signe → création d'une **Session** rattachée à la **FormationVersion active**.
2. Le `ProcessTemplate` de cette version est instancié en `StepInstance` avec `due_date` calculées.
3. Le process complet est figé dans `process_snapshot_json`.
4. Un **cron quotidien** scanne les `StepInstance` dues aujourd'hui et exécute leur action.
5. Les étapes `manual` s'affichent dans la checklist de la session à cocher.

### 6.4 Édition sans code

Toute la checklist (`StepTemplate`, `MessageTemplate`) est de la **donnée éditable dans l'UI**. Changer un mail, réordonner une phase, ajouter une étape = aucune ligne de code. Dupliquer un `ProcessTemplate` pour un nouveau secteur = quelques clics.

---

## 7. Versioning & suppression — garanties

### 7.1 Modifier une formation

- Une modif crée une **nouvelle FormationVersion** (statut `draft` puis `active`).
- Les sessions **en cours et passées** gardent leur version → programme/process intacts.
- Les **nouvelles** sessions prennent la dernière version active.
- Chaque version stocke un **`changelog`** (« v2 : ajout module RGPD, retrait exo 3 »). Suffisant pour l'audit. (Diff automatique champ-par-champ = évolution possible plus tard.)

### 7.2 Supprimer une formation

- **Soft-delete** : `archived_at` posé, la formation quitte les listes actives.
- Tout ce qui pointe vers elle (dossiers, docs, émargements) **reste intact**.
- `onDelete: Restrict` empêche toute cascade destructrice.
- Un dossier élève est autonome et tient debout même formation archivée.

---

## 8. Création de formations & exercices — l'usage quotidien

### 8.1 Arbre de contenu (modèle Notion)

```
Formation → Module → Leçon → [ContentBlocks empilables]
```

Créer une leçon = empiler des blocs (texte, image, vidéo, PDF, quiz, exo) réordonnables par glisser-déposer. Pas de mise en page à gérer.

### 8.2 Types d'exercices réutilisables

| Type | Correction | Usage typique |
|---|---|---|
| QCM / Vrai-Faux | **Auto** | Éval initiale, quiz de module |
| Réponse courte | Auto (mot-clé) ou manuelle | Vérif rapide |
| Texte long / rédaction | **Manuelle** | Cas pratiques |
| Upload de fichier | Manuelle | Livrables, projets |
| Quiz noté | Auto + note | Éval finale |

Créer un exo = choisir un `type` + remplir un formulaire (énoncé, options, bonne réponse, barème). Les manuels arrivent dans une **file « à corriger »** (note + retour individuel = checklist Phase 4).

### 8.3 Ce qui rend la création rapide (à prévoir dès le départ)

- **Duplication** de tout : leçon, module, formation entière.
- **Bibliothèque réutilisable** de blocs et d'exos : créé une fois, réutilisé partout.
- **Mode brouillon** : construire tranquille, publier quand prêt (→ crée une version).

---

## 9. Suivi du temps passé (logs)

### 9.1 Pourquoi

Double usage : suivi pédagogique **et** preuve d'assiduité FOAD exigée par l'OPCO (justifier le temps de connexion réel en distanciel).

### 9.2 Fiabilité des chiffres

- **Heartbeat** : la page émet un signal toutes les ~30 s tant qu'elle est active.
- **Détection d'inactivité** : onglet en arrière-plan ou zéro interaction pendant X min → pause. Sinon un onglet laissé ouvert fausse tout.
- **Agrégation** : temps par leçon / exo / module / élève / session (table `TimeAggregate`).

### 9.3 Sorties

- Vue analytique : « Jean — 42 min Module 1, 12 min exo 3, contrat ouvert 2×. »
- **Relevé de temps de connexion par élève et par jour**, exportable → preuve FOAD pour l'OPCO.

---

## 10. Double vue & dossiers de preuve

### 10.1 Deux axes de navigation

- **Axe Formation** : Formation → Sessions → élèves (en cours / terminé / abandonné, anciens inclus).
- **Axe Élève** : dossier complet (toutes formations, docs, émargements, exos, signatures).

### 10.2 Export dossier ZIP

Bouton « Télécharger le dossier » → ZIP classé par session → phase → type :

```
Dossier_Dupont_Jean.zip
├── manifest.pdf                      (sommaire : type, date, statut signature)
├── Formation_IA_BTP_—_mars2024/
│   ├── 01_Contrat_signé.pdf
│   ├── 04_Émargements/ J1_matin.pdf … J9_aprem.pdf
│   ├── 05_Exercices_notés.pdf
│   └── 06_Attestation.pdf
└── Formation_RGPD_—_sept2025/ …
```

Granularités : un élève (multi-formations) / un élève sur une session / une session entière.

**Technique :** fichiers depuis Supabase Storage (URLs signées, respecte RLS) ; ZIP **streamé** (`archiver` Node) pour ne pas saturer le VPS ; gros dossiers générés en tâche de fond. Chaque export est loggé dans `AccessLog`.

---

## 11. Espace élève (simple)

- Login par email → voit **ses** formations assignées (via `Enrollment` liée à son compte).
- Pour chaque formation : modules/leçons à lire, exos à faire, visios à rejoindre.
- **Une conversation** par formation : reçoit les messages (auto + manuels), y compris les demandes de signature → signe via Yousign directement.
- Ne voit jamais rien d'un autre élève (RLS).

---

## 12. Conformité (RGPD / Qualiopi)

- **Durée de conservation** : `retention_until` par document (archives Qualiopi/OPCO = plusieurs années), tag de purge.
- **Journal d'accès** (`AccessLog`) : qui a ouvert/exporté quel dossier, quand.
- **Traçabilité** : versions figées + docs horodatés + relevés d'assiduité = dossier de preuve complet à tout moment.

---

## 13. Ordre de construction (paliers)

Chaque palier livre un outil **utilisable** — pas de tunnel.

| Palier | Contenu | Résultat |
|---|---|---|
| **1 — Fondations** | Auth + rôles/permissions + RLS ; CRUD Formation/Version/Session/Enrollment ; back-office basique | Suivi des formations en interne |
| **2 — Moteur de checklist** | ProcessTemplate/StepTemplate éditables + StepInstance + affichage checklist par session | Remplace le suivi manuel des 7 phases |
| **3 — Automatisation** | MessageTemplate + Resend + cron temporel | Mails auto aux bonnes dates → **MVP réel** |
| **4 — Espace élève** | Login élève + arbre contenu + exos + soumissions + conversation | Les élèves travaillent sur la plateforme |
| **5 — Signature + GED** | Yousign (contrats + émargements) + Storage + export ZIP | Dossiers de preuve complets |
| **6 — Visio** | Google Calendar/Meet auto | Visios générées depuis les sessions |
| **7 — Logs & analytics** | Heartbeat + ActivityLog + TimeAggregate + relevés | Preuve FOAD + suivi pédagogique |

> **Après le Palier 3, tu as déjà un outil qui te fait gagner du temps réel.** C'est ton MVP.

---

## 14. Pièges à éviter (récapitulatif)

1. **Jamais de rôles en dur** → permissions + RLS.
2. **Séparer Formation (modèle) / Session (instance)** dès le début.
3. **Session pointe vers une Version**, pas vers la Formation.
4. **Soft-delete + `onDelete: Restrict`** partout → dossiers indestructibles.
5. **Figer le process (snapshot)** au démarrage de session.
6. **Heartbeat + inactivité** pour des temps fiables (sinon inutilisables en audit).
7. **ZIP streamé**, jamais tout en mémoire.

---

*Fin du document.*
