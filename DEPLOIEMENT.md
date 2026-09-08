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
- [ ] **Programmer le passage des notifications toutes les 15 minutes** :
      `POST https://<domaine>/api/cron/notifications`, même en-tête
      `Authorization: Bearer $CRON_SECRET`. Il prévient par mail qui n'a pas lu
      ses messages de fil. Sans lui, les fils fonctionnent toujours, mais
      personne n'est prévenu : les messages attendent la prochaine connexion.
      Aucune heure particulière, aucun fuseau à gérer.
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
      `http://localhost:3000/espace`, **et surtout le lien d'activation envoyé aux
      élèves pointe vers une machine locale** : l'invitation serait inutilisable.
      **À faire avant tout envoi réel.**
- [ ] Appliquer les migrations Prisma sur la base de production (`prisma migrate deploy`).
- [ ] Lancer le seed des rôles et permissions, et créer le compte super-administrateur.
- [ ] Vérifier que les policies RLS sont bien actives sur la base de production
      (27 tables, voir la migration `rls_auth_sync`).

## Signature électronique — SignWell (Palier 5)

- [ ] **Passer `SIGNATURE_MODE` à `production`**, et seulement après avoir
      déroulé un parcours complet en test. C'est le geste qui rend les
      signatures juridiquement engageantes : tant qu'il n'est pas fait, chaque
      document part en `test_mode` et le signataire est réécrit vers
      `MAIL_SANDBOX_TO`.
- [ ] **Vérifier le quota et le plan SignWell** : les documents de test sont
      gratuits, les documents réels sont décomptés.
- [ ] **Déclarer le webhook** `https://<domaine>/api/webhooks/signwell` dans
      SignWell (événement « document terminé »). Sans lui, rien n'est perdu :
      le bouton « Actualiser » sur la pièce redemande le statut. Le webhook ne
      sert que de déclencheur — la plateforme revérifie toujours le statut
      auprès de l'API avec sa propre clé, donc un appel forgé n'a aucun effet.
- [ ] **`SIGNWELL_API_KEY`** : créer une clé dédiée à la production et révoquer
      celle de développement.
- [ ] Vérifier après bascule qu'une signature réelle aboutit : le PDF signé
      revient avec sa page de preuve et se range à côté de l'original.

## Documents et dossier de preuve (Palier 5)

- [ ] **Créer le bucket privé `documents`** sur le projet de production, comme
      `content` et `submissions`. Il doit rester **non public** : chaque
      ouverture passe par `/api/documents/[documentId]`, qui vérifie les droits
      puis délivre une URL signée de 60 secondes.
- [ ] **Sauvegarder ce bucket** avec une rétention longue : ce sont les pièces
      d'audit (contrats, conventions, émargements signés, attestations). Leur
      perte est irrattrapable, contrairement aux supports de cours.
- [ ] Définir la **durée de conservation** par type de pièce et renseigner
      `retention_until` en conséquence (obligations comptables et Qualiopi
      d'un côté, minimisation RGPD de l'autre).

## Export du dossier de preuve (Palier 5)

- [ ] **Surveiller la durée des gros exports** : l'archive est streamée, donc la
      mémoire ne monte pas, mais un dossier de session volumineux tient la
      requête ouverte le temps de copier chaque pièce. Vérifier le délai maximal
      de l'hébergeur (proxy et fonction serveur) avant le premier export réel
      d'une session complète.
- [ ] Vérifier que les exports apparaissent bien dans l'`AccessLog`
      (`export_dossier_eleve`, `export_dossier_session`) : qui a sorti quel
      dossier, et quand.

## Invitation des élèves (Palier 4)

- [ ] **Allonger la durée de validité des liens e-mail** dans Supabase
      (*Authentication → Emails → Email OTP Expiration*) : 1 heure par défaut,
      ce qui est court pour une invitation qu'un élève ouvre le soir. Viser 24 h.
      Le lien reste à usage unique, et un lien expiré est toujours rattrapable
      par « Renvoyer l'invitation » depuis la fiche de l'élève.
- [ ] **Ne pas activer les mails d'authentification de Supabase** : la plateforme
      génère elle-même le lien et l'envoie par Resend, pour que le bac à sable
      s'applique et que le texte soit le nôtre. Un mail envoyé directement par
      Supabase échapperait au garde-fou `MAIL_MODE`.
- [ ] Vérifier après bascule en production qu'une invitation réelle arrive bien,
      que le lien ouvre la page d'activation et que le mot de passe choisi
      permet ensuite de se connecter.

## Conformité

- [ ] Renseigner la **durée en heures** sur chaque session : mention obligatoire
      Qualiopi sur la convocation et l'attestation.
- [ ] Relire les 5 templates de mails avec l'œil Qualiopi avant le premier envoi réel.
