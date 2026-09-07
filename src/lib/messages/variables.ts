// Variables insérables dans un MessageTemplate (objet et corps), sous la forme
// {{cle}}. Chaque variable a une valeur d'exemple pour l'aperçu, et sera
// résolue à l'envoi depuis la session, l'élève, l'entreprise et le formateur.
export type MessageVariable = { key: string; label: string; sample: string };

export const MESSAGE_VARIABLES: MessageVariable[] = [
  { key: "eleve.prenom", label: "Prénom de l'élève", sample: "Jean" },
  { key: "eleve.nom", label: "Nom complet de l'élève", sample: "Jean Dupont" },
  { key: "eleve.email", label: "Email de l'élève", sample: "jean.dupont@exemple.fr" },
  { key: "formation.nom", label: "Intitulé de la formation", sample: "Formation IA — BTP" },
  { key: "session.nom", label: "Nom de la session", sample: "Session mars 2027" },
  { key: "session.date_debut", label: "Date de début", sample: "1 mars 2027" },
  { key: "session.date_fin", label: "Date de fin", sample: "12 mars 2027" },
  { key: "session.duree_heures", label: "Durée totale en heures", sample: "63" },
  { key: "entreprise.nom", label: "Entreprise cliente", sample: "Bâtiments Durand" },
  { key: "formateur.nom", label: "Formateur référent", sample: "Arsène Lecoq" },
  { key: "formateur.email", label: "Email du formateur", sample: "contact@exemple.fr" },
  { key: "lien_espace_eleve", label: "Lien vers l'espace élève", sample: "https://exemple.fr/espace" },
];

export const VARIABLE_KEYS = MESSAGE_VARIABLES.map((v) => v.key);

export const SAMPLE_VALUES: Record<string, string> = Object.fromEntries(
  MESSAGE_VARIABLES.map((v) => [v.key, v.sample]),
);

// Bloc conditionnel : {{#si cle}}…{{/si}} n'est gardé que si la variable a une
// valeur. Sans lui, un champ vide laisse des phrases bancales dans un document
// officiel (« organisée pour . » quand la session n'a pas d'entreprise cliente).
// Deux formes : le bloc qui occupe ses propres lignes disparaît entièrement,
// ligne comprise ; le bloc au milieu d'une phrase ne retire que son fragment.
// Les blocs imbriqués ne sont pas gérés.
const CONDITIONAL_LINE = /^[ \t]*\{\{#si\s+([a-z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/si\}\}[ \t]*(\r?\n|$)/gim;
const CONDITIONAL_INLINE = /\{\{#si\s+([a-z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/si\}\}/gi;

const isFilled = (values: Record<string, string>, key: string) =>
  Object.prototype.hasOwnProperty.call(values, key) && values[key].trim() !== "";

export function renderConditionals(text: string, values: Record<string, string>): string {
  return text
    .replace(CONDITIONAL_LINE, (_m, key: string, inner: string, eol: string) =>
      isFilled(values, key) ? inner + eol : "",
    )
    .replace(CONDITIONAL_INLINE, (_m, key: string, inner: string) => (isFilled(values, key) ? inner : ""));
}

// Remplace {{cle}} par sa valeur. Une variable inconnue est laissée visible
// telle quelle, pour que l'erreur saute aux yeux plutôt que de disparaître.
export function renderVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

// Variables utilisées dans un texte, et celles qui n'existent pas.
// Les clés testées par {{#si …}} comptent aussi : une faute de frappe y
// masquerait silencieusement tout un paragraphe.
export function inspectVariables(text: string) {
  const used = [...text.matchAll(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi)].map((m) => m[1]);
  const tested = [...text.matchAll(/\{\{#si\s+([a-z0-9_.]+)\s*\}\}/gi)].map((m) => m[1]);
  const unique = [...new Set([...used, ...tested])];
  return { used: unique, unknown: unique.filter((k) => !VARIABLE_KEYS.includes(k)) };
}
