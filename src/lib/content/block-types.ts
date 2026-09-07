// Menu « / » de l'éditeur : chaque entrée insère un bloc de contenu déjà amorcé.
//
// Conformément au modèle (spec §5.4), un bloc de texte porte du Markdown :
// titres, listes, citations, code et séparateurs sont des formes de Markdown,
// pas des types de blocs distincts. Le type en base distingue ce qui n'est pas
// du texte (image, vidéo, PDF, contenu intégré…), qui viendra à l'étape médias.
export type BlockChoice = {
  key: string;
  label: string;
  hint: string;
  /// Markdown inséré à la création. `|` marque où placer le curseur.
  template: string;
  keywords: string[];
};

export const BLOCK_CHOICES: BlockChoice[] = [
  { key: "text", label: "Texte", hint: "Paragraphe", template: "|", keywords: ["texte", "paragraphe", "p"] },
  { key: "h2", label: "Titre", hint: "Titre de section", template: "## |", keywords: ["titre", "h2", "section"] },
  { key: "h3", label: "Sous-titre", hint: "Titre de niveau 3", template: "### |", keywords: ["sous-titre", "h3"] },
  { key: "ul", label: "Liste à puces", hint: "Points non ordonnés", template: "- |", keywords: ["liste", "puce", "ul"] },
  { key: "ol", label: "Liste numérotée", hint: "Étapes ordonnées", template: "1. |", keywords: ["liste", "numero", "ol", "etapes"] },
  { key: "todo", label: "Cases à cocher", hint: "Liste de tâches", template: "- [ ] |", keywords: ["case", "cocher", "tache", "todo"] },
  { key: "quote", label: "Citation", hint: "Mise en retrait", template: "> |", keywords: ["citation", "quote"] },
  { key: "code", label: "Bloc de code", hint: "Avec coloration", template: "```ts\n|\n```", keywords: ["code", "extrait"] },
  { key: "note", label: "Encadré Note", hint: "Information", template: "> [!NOTE]\n> |", keywords: ["note", "encadre", "callout", "info"] },
  { key: "tip", label: "Encadré Conseil", hint: "Bonne pratique", template: "> [!TIP]\n> |", keywords: ["conseil", "astuce", "tip"] },
  { key: "warning", label: "Encadré Attention", hint: "Point de vigilance", template: "> [!WARNING]\n> |", keywords: ["attention", "warning", "vigilance"] },
  { key: "table", label: "Tableau", hint: "Trois colonnes", template: "| Colonne | Colonne | Colonne |\n| --- | --- | --- |\n| | | |", keywords: ["tableau", "table"] },
  { key: "divider", label: "Séparateur", hint: "Trait horizontal", template: "---", keywords: ["separateur", "trait", "hr", "ligne"] },
];

export function findChoice(key: string): BlockChoice | undefined {
  return BLOCK_CHOICES.find((c) => c.key === key);
}
