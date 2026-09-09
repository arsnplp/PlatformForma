// Clés de permissions (spec §4). Ce sont des DONNÉES : la liste ci-dessous sert
// au seed et à l'autocomplétion, jamais à coder un rôle en dur. Le code ne
// teste que des permissions, jamais un rôle.

export const PERMISSIONS = {
  can_access_backoffice: "Accéder au back-office",
  can_grant_admin: "Promouvoir un utilisateur en super-administrateur",
  can_manage_users: "Gérer les utilisateurs et leurs rôles",
  can_edit_formation: "Créer et modifier les formations (versions, contenu)",
  can_edit_process_template: "Modifier les process et templates de mails",
  can_manage_companies: "Gérer les entreprises et prospects",
  can_manage_sessions: "Créer et modifier les sessions et inscriptions",
  can_correct_exercises: "Corriger les exercices",
  can_view_all_dossiers: "Voir tous les dossiers (élèves, sessions, documents)",
  can_export_dossier: "Exporter un dossier de preuve",
  can_manage_visio: "Créer et gérer les visios",
  can_generate_demo_data: "Générer des données de démonstration (estampillées isDemo)",
  can_use_assistant: "Utiliser l'assistant : interroger ses données et agir en son nom",
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

// Rôles initiaux du seed. Le rôle est une clé en base ; il peut être renommé,
// et ses permissions modifiées, sans toucher au code.
//
// Un formateur est un opérateur complet et CLOISONNÉ : il gère son propre CRM,
// ses formations, ses sessions et ses élèves (lignes dont il est `ownerId`).
// Il définit aussi le process (docs, signatures, mails) de SES formations.
// Le super-admin a le même espace propre + la supervision de tout
// (can_view_all_dossiers) + la gestion des utilisateurs et des données démo.
export const SEED_ROLES: Record<string, { label: string; permissions: PermissionKey[] }> = {
  super_admin: { label: "Super administrateur", permissions: PERMISSION_KEYS },
  formateur: {
    label: "Formateur",
    permissions: [
      "can_access_backoffice",
      "can_manage_companies",
      "can_edit_formation",
      "can_edit_process_template",
      "can_manage_sessions",
      "can_correct_exercises",
      "can_export_dossier",
      "can_manage_visio",
    ],
  },
  eleve: { label: "Élève", permissions: [] },
};
