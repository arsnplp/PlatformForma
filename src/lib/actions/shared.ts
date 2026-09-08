import type { ZodType } from "zod";

// État renvoyé par les Server Actions de formulaire (useActionState).
// `values` = valeurs soumises, renvoyées en cas d'erreur pour re-remplir le
// formulaire (React 19 réinitialise les champs non contrôlés après une action).
export type FormState =
  | { error?: string; fieldErrors?: Record<string, string[] | undefined>; values?: Record<string, string> }
  | undefined;

// Parse un FormData avec un schéma zod ; renvoie soit les données, soit un FormState d'erreur.
// `prefix` permet de valider un second objet dans le même formulaire : les
// champs « company_nom », « company_siret »… sont lus comme « nom », « siret »,
// et les erreurs ressortent avec leur préfixe pour retrouver le bon champ.
export function parseForm<T>(schema: ZodType<T>, formData: FormData, prefix = ""):
  | { ok: true; data: T }
  | { ok: false; state: FormState } {
  const raw: Record<string, string> = {};
  const all: Record<string, string> = {};
  formData.forEach((value, key) => {
    if (key.startsWith("$ACTION")) return;
    if (typeof value !== "string") return;
    all[key] = value;
    if (!prefix) raw[key] = value;
    else if (key.startsWith(prefix)) raw[key.slice(prefix.length)] = value;
  });
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = prefix + String(issue.path[0] ?? "_");
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, state: { error: "Vérifie les champs en erreur.", fieldErrors, values: all } };
}

// Construit un FormState d'erreur sur un champ précis, en conservant les valeurs saisies.
export function fieldError(formData: FormData, field: string, message: string): FormState {
  const values: Record<string, string> = {};
  formData.forEach((v, k) => {
    if (!k.startsWith("$ACTION") && typeof v === "string") values[k] = v;
  });
  return { error: "Vérifie les champs en erreur.", fieldErrors: { [field]: [message] }, values };
}

// Chaîne vide → null (champs optionnels des formulaires).
export const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
