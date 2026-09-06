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

// Remplace {{cle}} par sa valeur. Une variable inconnue est laissée visible
// telle quelle, pour que l'erreur saute aux yeux plutôt que de disparaître.
export function renderVariables(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match,
  );
}

// Variables utilisées dans un texte, et celles qui n'existent pas.
export function inspectVariables(text: string) {
  const used = [...text.matchAll(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi)].map((m) => m[1]);
  const unique = [...new Set(used)];
  return { used: unique, unknown: unique.filter((k) => !VARIABLE_KEYS.includes(k)) };
}
