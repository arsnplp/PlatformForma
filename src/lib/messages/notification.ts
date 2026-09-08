// Notification d'un fil non lu. Volontairement sans extrait : le contenu des
// échanges reste sur la plateforme, le mail ne sert qu'à ramener la personne.
export const MESSAGE_NOTIFICATION_TEMPLATE = {
  subject: "{{compte}} — {{session.nom}}",
  body: `Bonjour {{destinataire.prenom}},

{{expediteur.nom}} vous a écrit dans le fil de la formation **{{formation.nom}}**{{#si session.nom}} ({{session.nom}}){{/si}}.

Pour lire {{compte_minuscule}} et répondre :

{{lien_fil}}

{{#si rappel}}{{rappel}}
{{/si}}Bonne journée,
La plateforme de formation`,
};

// Invitation à signer, pour un signataire qui n'a pas de compte sur la
// plateforme — typiquement le contact d'une entreprise cliente. L'élève, lui,
// signe depuis son espace : il n'a pas besoin de ce message.
export const SIGNATURE_REQUEST_TEMPLATE = {
  subject: "À signer : {{document.titre}}",
  body: `Bonjour {{destinataire.prenom}},

{{demandeur.nom}} vous demande de signer le document **{{document.titre}}**{{#si formation.nom}}, pour la formation {{formation.nom}}{{/si}}.

Pour le relire et le signer :

{{lien_signature}}

Ce lien vous est **personnel**. La signature se fait en ligne, sans installation.

Bonne journée,
La plateforme de formation`,
};
