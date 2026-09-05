import { requireUser } from "@/lib/auth/session";

export default async function AdminHome() {
  const user = await requireUser("/admin");
  const permissions = [...user.permissions].sort();

  return (
    <div>
      <h1 className="text-3xl font-semibold tracking-tight">Bonjour {user.name}</h1>
      <p className="mt-2 text-foreground-secondary">{user.email}</p>

      <h2 className="mt-10 text-xl font-semibold">Rôles</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {user.roles.map((r) => (
          <li key={r.key} className="rounded-sm bg-status-blue-bg px-2 py-0.5 text-sm text-status-blue">
            {r.label}
          </li>
        ))}
      </ul>

      <h2 className="mt-10 text-xl font-semibold">Permissions</h2>
      <ul className="mt-3 space-y-1 font-mono text-sm text-foreground-secondary">
        {permissions.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
    </div>
  );
}
