// Mail d'invitation d'un élève : message système, le même pour toutes les
// formations, donc écrit ici et non dans les MessageTemplate d'une version.
// Il ne contient jamais de mot de passe : seulement un lien à usage unique.
export const INVITATION_TEMPLATE = {
  subject: "Votre accès à la plateforme de formation",
  body: `Bonjour {{eleve.prenom}},

{{#si formation.nom}}{{formateur.nom}} vous a inscrit(e) à la formation **{{formation.nom}}**{{#si session.nom}} ({{session.nom}}){{/si}}.{{/si}}{{#si sans_formation}}{{formateur.nom}} vous a créé un accès à la plateforme de formation.{{/si}}

Pour accéder à votre espace, choisissez votre mot de passe :

{{lien_activation}}

Ce lien est **personnel** et valable une seule fois. S'il a expiré, demandez à
votre formateur de vous en renvoyer un : votre compte, lui, reste actif.

## Votre espace personnel

Vous y trouverez le programme, les supports, les exercices et vos échanges avec
votre formateur. Vous vous y connecterez ensuite avec votre adresse
{{eleve.email}} et le mot de passe que vous aurez choisi.

Une question ? Répondez à votre formateur : {{formateur.nom}}{{#si formateur.email}} — {{formateur.email}}{{/si}}.

Bonne formation,
{{formateur.nom}}`,
};

// Mail d'invitation d'un contact entreprise. Son espace n'est pas celui d'un
// élève : il n'y suit pas de cours, il y suit un dossier. Le message le dit,
// et il annonce d'emblée ce que le contact NE verra pas — c'est ce qu'un
// employeur demande en premier, et c'est ce que ses salariés ont le droit de
// savoir.
export const COMPANY_INVITATION_TEMPLATE = {
  subject: "Votre accès à l'espace entreprise",
  body: `Bonjour {{contact.prenom}},

{{formateur.nom}} vous ouvre un accès à l'espace de **{{entreprise.nom}}** sur la
plateforme de formation.

Pour y accéder, choisissez votre mot de passe :

{{lien_activation}}

Ce lien est **personnel** et valable une seule fois. S'il a expiré, demandez-en
un nouveau : votre compte, lui, reste actif.

## Ce que vous y trouverez

Les salariés de votre entreprise inscrits en formation, les sessions qui les
concernent, et le dossier de votre société : conventions, devis et factures.
C'est aussi là que vous déposerez les pièces demandées et signerez les documents.

## Ce que vous n'y verrez pas

Le travail de vos salariés : leurs réponses aux exercices, leurs notes et leurs
échanges avec le formateur restent entre eux et l'organisme.

Une question ? Répondez à {{formateur.nom}}{{#si formateur.email}} — {{formateur.email}}{{/si}}.

Bien à vous,
{{formateur.nom}}`,
};
