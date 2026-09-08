import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getContactCompany, getCompanyEmployees, getCompanyTrainings } from "@/lib/queries/company-space";
import { countWaitingSlots } from "@/lib/queries/slots";
import { SESSION_STATUS, ENROLLMENT_STATUS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { StatusBadge } from "@/components/admin/status-badge";
import { EmptyState } from "@/components/admin/empty-state";
import { UnreadBadge } from "@/components/admin/unread-badge";

// Ce que l'entreprise finance : ses salariés, et les formations qu'ils suivent.
// Jamais leurs notes, leurs livrables ni leurs messages — voir company-space.ts.
export default async function EntreprisePage() {
  const me = await requireUser("/entreprise");
  const company = await getContactCompany(me);
  if (!company) notFound();

  const [employees, sessions, waiting] = await Promise.all([
    getCompanyEmployees(company.id, me.id),
    getCompanyTrainings(company.id),
    countWaitingSlots({ companyId: company.id }),
  ]);
  const inTraining = employees.filter((e) => e.enrollments.some((x) => x.status === "active")).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Bonjour {me.name.split(" ")[0]}</h1>
        <p className="mt-2 text-foreground-secondary">
          Le dossier de formation de {company.name}.
        </p>
        <p className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/entreprise/documents" className="flex items-center gap-1.5 font-medium text-brand hover:underline">
            Documents de l&apos;entreprise →
            <UnreadBadge count={waiting} />
          </Link>
        </p>
        <p className="mt-3 text-sm text-foreground-tertiary">
          {[company.sector, company.siret ? `SIRET ${company.siret}` : null, company.address]
            .filter(Boolean).join(" · ") || "—"}
        </p>
      </div>

      {/* ─── Salariés ───────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Vos salariés</h2>
          <p className="mt-1 text-sm text-foreground-secondary">
            {employees.length === 0
              ? "Aucun salarié rattaché pour l'instant."
              : `${employees.length} salarié(s) rattaché(s), dont ${inTraining} en formation.`}
          </p>
        </div>

        {employees.length === 0 ? (
          <EmptyState title="Personne n'est encore rattaché">
            Votre organisme de formation rattache vos salariés à votre entreprise au moment de les inscrire.
          </EmptyState>
        ) : (
          <ul className="divide-y rounded-md border">
            {employees.map((e) => (
              <li key={e.id} className="px-4 py-3 text-sm">
                <p className="font-medium">{e.name}</p>
                {e.enrollments.length === 0 ? (
                  <p className="mt-0.5 text-xs text-foreground-tertiary">Aucune formation en cours.</p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {e.enrollments.map((en) => {
                      const es = ENROLLMENT_STATUS[en.status];
                      return (
                        <li key={en.id} className="flex flex-wrap items-center gap-2 text-xs text-foreground-secondary">
                          <span className="text-foreground">{en.session.formationVersion.formation.name}</span>
                          <StatusBadge tone={es.tone}>{es.label}</StatusBadge>
                          <span>
                            {en.session.name} · du {formatDate(en.session.startDate)} au {formatDate(en.session.endDate)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ─── Formations ─────────────────────────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-semibold">Formations</h2>
          <p className="mt-1 text-sm text-foreground-secondary">
            Les sessions qui concernent votre entreprise.
          </p>
        </div>

        {sessions.length === 0 ? (
          <EmptyState title="Aucune formation pour l'instant">
            Les sessions apparaîtront ici dès qu&apos;une inscription sera enregistrée.
          </EmptyState>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => {
              const ss = SESSION_STATUS[s.status];
              return (
                <li key={s.id} className="rounded-lg border px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{s.formationVersion.formation.name}</p>
                      <p className="mt-0.5 text-sm text-foreground-secondary">{s.name}</p>
                    </div>
                    <StatusBadge tone={ss.tone}>{ss.label}</StatusBadge>
                  </div>
                  <p className="mt-3 text-xs text-foreground-tertiary">
                    Du {formatDate(s.startDate)} au {formatDate(s.endDate)}
                    {s.durationHours ? ` · ${s.durationHours} heures` : ""}
                    {s.trainer ? ` · formateur : ${s.trainer.name}` : ""}
                    {` · ${s.enrollments.length} participant(s) de votre entreprise`}
                  </p>
                  {s.enrollments.length > 0 ? (
                    <p className="mt-1 text-xs text-foreground-secondary">
                      {s.enrollments.map((en) => en.user.name).join(", ")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
