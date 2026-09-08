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
