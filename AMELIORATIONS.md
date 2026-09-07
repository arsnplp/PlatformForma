# Améliorations à faire

Idées validées mais volontairement reportées, pour ne pas élargir le palier en
cours. Chaque entrée dit *quoi*, *pourquoi* et *ce que ça implique*.
Une entrée traitée est retirée d'ici et décrite dans le commit correspondant.

## À faire juste après le Palier 4

### Notifier l'élève par mail quand le formateur lui écrit
Aujourd'hui un message écrit à la main attend dans le fil sans prévenir
personne : le badge « À lire » côté formateur est le seul signal, et l'élève
doit penser à ouvrir son espace.

- **Migration** : de quoi savoir ce qui a été lu et ce qui a déjà été notifié.
  Piste la plus simple : `Message.notifiedAt` (horodatage d'envoi de la
  notification) et `Conversation.lastReadAt` par lecteur — donc probablement une
  table de lecture, puisque le fil a deux lecteurs (élève et formateur).
- **Envoi** : réutiliser `sendMail` (`src/lib/mail/send.ts`), donc le bac à
  sable s'applique tel quel. Un gabarit dédié, court, qui ne recopie pas le
  message mais renvoie vers le fil.
- **Anti-spam** : ne pas envoyer un mail par message. Regrouper (un seul mail
  tant que le précédent n'a pas été lu) ou temporiser quelques minutes.
- **Sens inverse** : prévenir aussi le formateur quand un élève répond.
- **Sessions de démonstration** : `isDemo` ne notifie jamais, comme partout.

## Détails repérés en passant

- **Compteur de messages non lus** : le badge « À lire » se contente de regarder
  qui a écrit en dernier. Un vrai « non lu » par personne viendra avec la
  migration ci-dessus.
