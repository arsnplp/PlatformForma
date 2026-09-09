import type { PermissionKey } from "@/lib/auth/permissions";

export type NavLink = { label: string; href: string; permission?: PermissionKey };

// La barre ne porte que le quotidien. Ce qui se consulte trois fois par an
// descend dans un menu : une barre courte se lit d'un coup d'œil, une barre
// longue oblige à chercher.
export const ADMIN_NAV: NavLink[] = [
  { label: "Formations", href: "/admin/formations", permission: "can_edit_formation" },
  { label: "Sessions", href: "/admin/sessions", permission: "can_manage_sessions" },
  { label: "Corrections", href: "/admin/corrections", permission: "can_correct_exercises" },
  { label: "Messages", href: "/admin/conversations", permission: "can_manage_sessions" },
];

// Les gens : trois listes de personnes, un seul point d'entrée.
export const ADMIN_PEOPLE: NavLink[] = [
  { label: "Élèves", href: "/admin/eleves", permission: "can_manage_sessions" },
  { label: "Entreprises", href: "/admin/entreprises", permission: "can_manage_companies" },
  { label: "Comptes et rôles", href: "/admin/utilisateurs", permission: "can_manage_users" },
];

// Le rare : journaux et outillage interne.
export const ADMIN_MORE: NavLink[] = [
  { label: "Journal des envois", href: "/admin/envois", permission: "can_manage_sessions" },
  { label: "Données de démonstration", href: "/admin/demo", permission: "can_generate_demo_data" },
  { label: "Design system", href: "/admin/design", permission: "can_generate_demo_data" },
];
