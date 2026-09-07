// Contenu de démonstration : sert à vérifier d'un coup d'œil que tous les
// éléments Markdown attendus (spec §3.2) sont rendus correctement.
export const MARKDOWN_SAMPLE = `# Comprendre l'IA générative

Ce module pose les bases. À la fin, vous saurez **ce qu'un modèle peut faire**, ce qu'il ne peut pas, et *comment formuler une demande utile*.

## Ce que vous allez apprendre

- Le vocabulaire essentiel
  - Modèle de langage, jeton, contexte
  - Température et créativité
- Les usages concrets sur un chantier
- Les limites à connaître

> [!NOTE]
> Aucun prérequis technique. Un ordinateur, une connexion, et de la curiosité.

## Votre progression

- [x] Lire cette introduction
- [x] Regarder la vidéo de démonstration
- [ ] Faire l'exercice 1
- [ ] Rédiger votre première consigne

## Tableau comparatif

| Usage | Gain de temps | Vigilance |
| --- | --- | --- |
| Rédiger un compte rendu | Élevé | Vérifier les chiffres |
| Traduire une notice | Élevé | Vocabulaire métier |
| Calculer un métré | Faible | ~~Fiable~~ à recalculer |

## Un exemple de consigne

Voici une consigne bien formulée, à adapter :

\`\`\`text
Tu es chef de chantier. Rédige un compte rendu de réunion
de 10 lignes à partir des notes ci-dessous, en français,
avec une liste des décisions et des responsables.
\`\`\`

Et le même appel, côté développeur :

\`\`\`ts
const response = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 1024,
  messages: [{ role: "user", content: prompt }],
});
\`\`\`

> [!WARNING]
> Ne saisissez jamais de données personnelles de vos salariés dans un outil
> d'IA grand public. Voir le module RGPD.

> [!TIP]
> Reformulez votre demande trois fois avant de conclure qu'elle ne marche pas.

Un mot en \`code\`, un [lien vers la documentation](https://example.org) et une citation :

> La bonne question vaut mieux que la bonne réponse.

---

> [!CAUTION]
> Les résultats doivent toujours être relus par un humain avant diffusion.
`;
