# À faire le jour du déploiement

Liste tenue à jour au fil des paliers. Tout ce qui doit être réglé avant la
mise en production, ou juste après. Cocher au fur et à mesure.

## Envoi de mails (Palier 3)

- [ ] **Vérifier le domaine `plateforma.nairox.fr` chez Resend** (configuration DNS en cours).
      Ajouter les enregistrements SPF, DKIM et le domaine de retour fournis par Resend.
      Tant que ce n'est pas fait, Resend n'accepte d'envoyer que vers l'adresse
      du propriétaire du compte (`arsene.lecoq8@gmail.com`).
- [ ] **Changer `MAIL_FROM`** pour une adresse du domaine vérifié
      (ex. `Nairox Formation <contact@plateforma.nairox.fr>`), au lieu de `onboarding@resend.dev`.
- [ ] **Passer `MAIL_MODE` à `production`**, seulement une fois le domaine vérifié
      ET les envois validés en bac à sable. C'est le geste qui ouvre les vannes :
      à partir de là, les mails partent réellement aux élèves.
      → Vérifier avant : convocation, identifiants, attestation, relance, enquête à froid,
        avec de vraies dates et une vraie durée en heures.
- [ ] **`MAIL_SANDBOX_TO`** : garder une adresse valide même en production, elle
      redevient le filet de sécurité si l'on repasse en bac à sable.

## Tâches planifiées (Palier 3)

- [ ] **Programmer le cron quotidien à 7h heure de Paris**, par `pg_cron` sur Supabase
      ou par le cron du VPS. Appel HTTP :
      `POST https://<domaine>/api/cron/process` avec l'en-tête
      `Authorization: Bearer $CRON_SECRET`.
      7h Paris = 5h UTC l'été (CEST), 6h UTC l'hiver (CET) : si l'ordonnanceur ne gère
      que l'UTC, prévoir deux entrées ou un décalage assumé. Le code, lui, compare
      déjà les échéances au calendrier de Paris.
- [ ] **Remplacer `CRON_SECRET`** par une valeur aléatoire forte
      (`openssl rand -hex 32`). La valeur actuelle est une valeur de développement.
- [ ] Vérifier après le premier passage réel que le journal (menu **Envois**) affiche
      bien `mode: production` et les vrais destinataires.

## Fichiers et stockage (Palier 4)

- [ ] **Créer le bucket privé `content`** sur le projet Supabase de production
      (il l'est déjà en développement). Il doit rester **non public** : chaque
      lecture passe par `/api/fichiers/[blockId]`, qui vérifie les droits puis
      délivre une URL signée de 60 secondes.
      Vérification : dans Supabase, Storage → `content` → le bucket ne doit pas
      être marqué « public ».
- [ ] Vérifier la limite de taille côté Supabase si le plan en impose une
      (l'application refuse au-delà de 50 Mo par fichier).
- [ ] **Créer le bucket privé `submissions`** (livrables d'élèves), lui aussi
      **non public**. Accès par `/api/livrables/[submissionId]` : seuls l'auteur
      et le formateur de la session, jamais les autres élèves.
- [ ] Prévoir la sauvegarde des deux buckets : les fichiers ne sont pas dans la
      base et ne sont donc pas couverts par les sauvegardes Postgres.
- [ ] **Rétention des livrables** : définir une durée de conservation des copies
      d'élèves (RGPD), distincte de celle des documents Qualiopi.

## Secrets et accès

- [ ] **Régénérer / vérifier les secrets Supabase** pour la production :
      `SUPABASE_SERVICE_ROLE_KEY`, mot de passe de la base, clé publishable.
      Ne jamais réutiliser en production une clé qui a circulé en développement.
- [ ] **`RESEND_API_KEY`** : créer une clé dédiée à la production, révoquer celle de développement.
- [ ] Vérifier que `.env` n'est pas déployé tel quel : les secrets passent par les
      variables d'environnement de l'hébergeur.

## Application

- [ ] **Définir `NEXT_PUBLIC_APP_URL`** avec l'URL publique (ex. `https://plateforma.nairox.fr`).
      Sans elle, la variable `{{lien_espace_eleve}}` des mails pointe vers
      `http://localhost:3000/espace`. **À faire avant tout envoi réel.**
- [ ] Appliquer les migrations Prisma sur la base de production (`prisma migrate deploy`).
- [ ] Lancer le seed des rôles et permissions, et créer le compte super-administrateur.
- [ ] Vérifier que les policies RLS sont bien actives sur la base de production
      (27 tables, voir la migration `rls_auth_sync`).

## Conformité

- [ ] Renseigner la **durée en heures** sur chaque session : mention obligatoire
      Qualiopi sur la convocation et l'attestation.
- [ ] Relire les 5 templates de mails avec l'œil Qualiopi avant le premier envoi réel.
