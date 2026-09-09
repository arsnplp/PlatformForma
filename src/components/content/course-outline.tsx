"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Outline } from "@/lib/queries/outline";
import { UnreadBadge } from "@/components/admin/unread-badge";
import { cn } from "@/lib/utils";

const seanceFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris",
});

// Sommaire permanent de la formation, à gauche. Les modules se déplient, celui
// où l'on se trouve s'ouvre tout seul : on ne cherche jamais sa place.
export function CourseOutline({
  sessionId,
  outline,
  unreadMessages,
  waitingDocuments,
}: {
  sessionId: string;
  outline: Outline;
  unreadMessages: number;
  waitingDocuments: number;
}) {
  const pathname = usePathname();
  const base = `/espace/sessions/${sessionId}`;
  const isOn = (href: string) => pathname === href;

  // Sommes-nous DANS une leçon ou une fin de module ? Sinon, on déplie le premier.
  const elsewhere = outline.modules.some(
    (m) => pathname === `${base}/modules/${m.id}` || m.lessons.some((l) => pathname === `${base}/lecons/${l.id}`),
  );

  const line = "block rounded-md px-2 py-1.5 text-sm transition-colors";
  const idle = "text-foreground-secondary hover:bg-surface hover:text-foreground";
  const active = "bg-surface font-medium text-foreground";

  return (
    <nav aria-label="Sommaire de la formation" className="space-y-4 text-sm">
      <div>
        <Link href={base} className={cn(line, isOn(base) ? active : idle)}>
          {outline.hasIntro ? "Introduction et programme" : "Programme"}
        </Link>
      </div>

      <ol className="space-y-1">
        {outline.modules.map((m, index) => {
          // Le module courant s'ouvre : la page ouverte est l'une de ses pages.
          const inside =
            pathname === `${base}/modules/${m.id}` ||
            m.lessons.some((l) => pathname === `${base}/lecons/${l.id}`);
          // Ailleurs (accueil, documents, messages), le premier module s'ouvre :
          // arriver devant une liste entièrement fermée n'aide personne.
          const open = inside || (index === 0 && !elsewhere);
          return (
            <li key={m.id}>
              <details open={open} className="group">
                <summary className="cursor-pointer list-none rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-foreground-tertiary hover:bg-surface">
                  <span aria-hidden className="mr-1 inline-block transition-transform group-open:rotate-90">›</span>
                  Module {m.order} · {m.title}
                </summary>

                <ol className="mt-0.5 space-y-0.5 pl-3">
                  {m.lessons.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`${base}/lecons/${l.id}`}
                        className={cn(line, isOn(`${base}/lecons/${l.id}`) ? active : idle)}
                      >
                        <span className="mr-1.5 font-mono text-xs text-foreground-tertiary">
                          {m.order}.{l.order}
                        </span>
                        {l.title}
                        {l.exercises > 0 ? (
                          <span
                            className="ml-1.5 text-xs text-foreground-tertiary"
                            title={`${l.exercises} exercice(s)`}
                          >
                            ✎ {l.exercises}
                          </span>
                        ) : null}
                      </Link>

                      {/* Les séances vivent dans leur leçon : on les voit
                          arriver au bon endroit du parcours, avec leur date. */}
                      {l.visios.map((v) => (
                        <p
                          key={v.blockId}
                          title={v.title}
                          className="flex items-baseline gap-1.5 truncate px-2 py-1 pl-5 text-xs text-foreground-tertiary"
                        >
                          <span aria-hidden>📹</span>
                          <span className="truncate">
                            {v.startsAt ? seanceFmt.format(v.startsAt) : v.title}
                          </span>
                        </p>
                      ))}
                    </li>
                  ))}

                  {m.exercises > 0 ? (
                    <li>
                      <Link
                        href={`${base}/modules/${m.id}`}
                        className={cn(line, isOn(`${base}/modules/${m.id}`) ? active : idle)}
                      >
                        <span aria-hidden className="mr-1.5 text-xs text-foreground-tertiary">✎</span>
                        Fin de module
                        <span className="ml-1.5 text-xs text-foreground-tertiary">
                          · {m.exercises} exercice{m.exercises > 1 ? "s" : ""}
                        </span>
                      </Link>
                    </li>
                  ) : null}
                </ol>
              </details>
            </li>
          );
        })}
      </ol>

      {/* Toujours à portée : ce qu'on doit fournir, et à qui parler. */}
      <div className="space-y-0.5 border-t pt-3">
        <Link
          href={`${base}/documents`}
          className={cn(line, "flex items-center justify-between gap-2", isOn(`${base}/documents`) ? active : idle)}
        >
          Mes documents
          <UnreadBadge count={waitingDocuments} />
        </Link>
        <Link
          href={`${base}/messages`}
          className={cn(line, "flex items-center justify-between gap-2", isOn(`${base}/messages`) ? active : idle)}
        >
          Messages
          <UnreadBadge count={unreadMessages} />
        </Link>
        <Link href={`${base}/plan`} className={cn(line, isOn(`${base}/plan`) ? active : idle)}>
          Plan de formation
        </Link>
      </div>
    </nav>
  );
}
