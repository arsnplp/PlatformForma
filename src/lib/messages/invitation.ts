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
