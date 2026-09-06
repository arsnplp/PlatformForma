// Templates de mails par défaut, proposés avec le process standard.
// Rédaction initiale : à corriger librement dans l'interface.
// Mentions Qualiopi / OPCO couvertes : intitulé, dates, durée, modalité FOAD,
// modalités d'accès et prérequis techniques, contact référent, accessibilité
// handicap, délai de rétractation le cas échéant.
export type DefaultTemplate = { name: string; subject: string; body: string };

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    name: "Convocation (J-7)",
    subject: "Convocation — {{formation.nom}} du {{session.date_debut}} au {{session.date_fin}}",
    body: `Bonjour {{eleve.prenom}},

Vous êtes convoqué(e) à la formation **{{formation.nom}}**, organisée pour {{entreprise.nom}}.

## Informations pratiques

- **Intitulé** : {{formation.nom}}
- **Session** : {{session.nom}}
- **Dates** : du {{session.date_debut}} au {{session.date_fin}}
- **Horaires** : 9h00 – 12h30 et 13h30 – 17h00
- **Durée totale** : {{session.duree_heures}} heures
- **Modalité** : formation ouverte et à distance (FOAD), en classe virtuelle
- **Lieu** : à distance, depuis votre poste de travail ou votre domicile

## Modalités d'accès

Vous accéderez à la plateforme et à la classe virtuelle depuis votre espace personnel :

{{lien_espace_eleve}}

Vos identifiants et le lien de connexion vous seront envoyés 48 heures avant le démarrage.

**Prérequis techniques** : un ordinateur avec webcam et micro, une connexion internet stable (2 Mb/s minimum), un navigateur à jour (Chrome, Firefox ou Edge).

## Accessibilité

Si votre situation nécessite un aménagement (handicap, contrainte particulière), contactez votre référent dès réception de ce message : nous étudierons les adaptations possibles.

## Votre contact

{{formateur.nom}} — {{formateur.email}}

À très bientôt,
{{formateur.nom}}`,
  },
  {
    name: "Identifiants et lien de connexion (J-2)",
    subject: "Vos accès — {{formation.nom}} démarre le {{session.date_debut}}",
    body: `Bonjour {{eleve.prenom}},

La formation **{{formation.nom}}** démarre le **{{session.date_debut}}** à 9h00.

## Votre espace personnel

Connectez-vous ici avec votre adresse {{eleve.email}} :

{{lien_espace_eleve}}

Vous y trouverez le programme, les supports, les exercices et le lien de la classe virtuelle.

## Test de connexion

Nous vous invitons à vous connecter **dès aujourd'hui** pour vérifier que tout fonctionne : accès à la plateforme, micro et caméra. En cas de difficulté, répondez à ce message, nous vous accompagnons.

## Rappel

- **Session** : {{session.nom}}
- **Dates** : du {{session.date_debut}} au {{session.date_fin}}
- **Modalité** : à distance (FOAD), classe virtuelle
- **Votre référent** : {{formateur.nom}} — {{formateur.email}}

Bonne formation,
{{formateur.nom}}`,
  },
  {
    name: "Attestation et bilan de fin (J)",
    subject: "Fin de formation — attestation et bilan — {{formation.nom}}",
    body: `Bonjour {{eleve.prenom}},

La formation **{{formation.nom}}** ({{session.nom}}, du {{session.date_debut}} au {{session.date_fin}}) s'achève aujourd'hui. Merci de votre participation.

## Vos documents

Votre **attestation de fin de formation** et votre **certificat de réalisation** sont disponibles dans votre espace personnel :

{{lien_espace_eleve}}

Ils mentionnent l'intitulé ({{formation.nom}}), les dates (du {{session.date_debut}} au {{session.date_fin}}), la durée ({{session.duree_heures}} heures) et la modalité à distance (FOAD) de la formation suivie.

## Évaluation finale et bilan

Merci de compléter, depuis votre espace, deux documents rapides :

1. l'**évaluation finale des acquis**,
2. le **bilan de satisfaction à chaud**.

Ces retours sont indispensables à notre démarche qualité (Qualiopi) et au suivi de votre financeur. Ils prennent moins de cinq minutes.

Pour toute question : {{formateur.nom}} — {{formateur.email}}

Merci et à bientôt,
{{formateur.nom}}`,
  },
  {
    name: "Relance bilan (J+2)",
    subject: "Rappel — votre bilan de formation {{formation.nom}}",
    body: `Bonjour {{eleve.prenom}},

Nous n'avons pas encore reçu votre **bilan de satisfaction** pour la formation **{{formation.nom}}** ({{session.nom}}, terminée le {{session.date_fin}}).

Il vous reste quelques minutes à y consacrer, depuis votre espace personnel :

{{lien_espace_eleve}}

Votre retour compte : il nourrit l'amélioration continue de nos formations et il est exigé dans le cadre de notre certification Qualiopi et du dossier transmis à votre financeur.

Si vous rencontrez une difficulté pour accéder au formulaire, répondez simplement à ce message.

Merci d'avance,
{{formateur.nom}} — {{formateur.email}}`,
  },
  {
    name: "Enquête à froid (J+90)",
    subject: "Trois mois après — votre retour sur {{formation.nom}}",
    body: `Bonjour {{eleve.prenom}},

Vous avez suivi la formation **{{formation.nom}}** en {{session.nom}}, il y a environ trois mois.

Nous aimerions savoir ce que vous en avez concrètement retiré dans votre activité quotidienne : ce que vous avez mis en pratique, ce qui vous a manqué, ce que nous devrions améliorer.

Le questionnaire est accessible depuis votre espace personnel et prend moins de cinq minutes :

{{lien_espace_eleve}}

Cette **enquête à froid** fait partie de notre démarche qualité (Qualiopi) : elle mesure l'impact réel de la formation, au-delà de la satisfaction immédiate.

Merci du temps que vous nous accordez,
{{formateur.nom}} — {{formateur.email}}`,
  },
];
