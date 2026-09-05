import type { PermissionKey } from "@/lib/auth/permissions";

export const ADMIN_NAV: { label: string; href: string; permission?: PermissionKey }[] = [
  { label: "Formations", href: "/admin/formations", permission: "can_edit_formation" },
  { label: "Sessions", href: "/admin/sessions", permission: "can_manage_sessions" },
  { label: "Entreprises", href: "/admin/entreprises", permission: "can_manage_companies" },
  { label: "Prospects", href: "/admin/prospects", permission: "can_manage_companies" },
  { label: "Utilisateurs", href: "/admin/utilisateurs", permission: "can_manage_users" },
];
