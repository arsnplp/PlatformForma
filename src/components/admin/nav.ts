import type { PermissionKey } from "@/lib/auth/permissions";

export const ADMIN_NAV: { label: string; href: string; permission?: PermissionKey }[] = [
  { label: "Formations", href: "/admin/formations", permission: "can_edit_formation" },
  { label: "Sessions", href: "/admin/sessions", permission: "can_manage_sessions" },
  { label: "Élèves", href: "/admin/eleves", permission: "can_manage_sessions" },
  { label: "Corrections", href: "/admin/corrections", permission: "can_correct_exercises" },
  { label: "Messages", href: "/admin/conversations", permission: "can_manage_sessions" },
  { label: "Envois", href: "/admin/envois", permission: "can_manage_sessions" },
  { label: "Entreprises", href: "/admin/entreprises", permission: "can_manage_companies" },
  { label: "Utilisateurs", href: "/admin/utilisateurs", permission: "can_manage_users" },
  { label: "Démo", href: "/admin/demo", permission: "can_generate_demo_data" },
];
