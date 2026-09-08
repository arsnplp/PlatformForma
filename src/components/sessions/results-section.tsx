import Link from "next/link";
import { getSessionResults, formatSeconds } from "@/lib/queries/results";
import { EXERCISE_TYPES } from "@/lib/content/exercise-config";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/admin/empty-state";
import { cn } from "@/lib/utils";

// Le tableau de la promo : élèves en lignes, exercices en colonnes.
// Une cellule dit l'essentiel d'un coup d'œil — vide, rendu, ou noté.
export async function ResultsSection({ sessionId }: { sessionId: string }) {
  const results = await getSessionResults(sessionId);

  if (results.rows.length === 0) {
    return <EmptyState title="Aucun élève inscrit">Les résultats apparaîtront dès la première inscription.</EmptyState>;
  }
  if (results.columns.length === 0) {
    return <EmptyState title="Aucun exercice dans cette formation">Ajoute des exercices à ses leçons ou à ses modules.</EmptyState>;
  }

  const toGrade = results.rows.reduce(
    (n, row) => n + [...row.cells.values()].filter((c) => c.state === "submitted").length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-foreground-secondary">
          {results.rows.length} élève(s) · {results.columns.length} exercice(s)
          {toGrade > 0 ? ` · ${toGrade} copie(s) à corriger` : " · tout est corrigé"}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/api/exports/resultats?session=${sessionId}`}>Exporter en CSV</Link>
        </Button>
      </div>

      {/* Le tableau déborde horizontalement dès qu'il y a beaucoup d'exercices :
          il défile dans son cadre, la page ne bouge pas. */}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr className="border-b bg-surface text-left">
              <th className="sticky left-0 z-10 border-r bg-surface px-3 py-2 font-medium">Élève</th>
              {results.columns.map((c) => (
                <th key={c.exerciseId} className="px-3 py-2 font-medium">
                  <span className="block max-w-[11rem] truncate" title={`${c.title} · ${c.place}`}>{c.title}</span>
                  <span className="block text-xs font-normal text-foreground-tertiary">
                    {EXERCISE_TYPES[c.type].label} · /{c.maxScore}
                  </span>
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">Points</th>
              <th className="px-3 py-2 text-right font-medium">Temps</th>
              <th className="px-3 py-2 text-right font-medium">Émargé</th>
            </tr>
          </thead>
          <tbody>
            {results.rows.map((row) => (
              <tr key={row.userId} className="border-b last:border-0">
                <th scope="row" className="sticky left-0 z-10 border-r bg-background px-3 py-2 text-left font-medium">
                  <Link href={`/admin/eleves/${row.userId}`} className="hover:underline">{row.name}</Link>
                </th>

                {results.columns.map((c) => {
                  const cell = row.cells.get(c.exerciseId);
                  if (!cell || cell.state === "todo") {
                    return <td key={c.exerciseId} className="px-3 py-2 text-foreground-tertiary">—</td>;
                  }
                  if (cell.state === "submitted") {
                    return (
                      <td key={c.exerciseId} className="px-3 py-2">
                        <Link
                          href={`/admin/corrections/${cell.submissionId}`}
                          className="text-status-orange underline underline-offset-2"
                        >
                          à corriger
                        </Link>
                      </td>
                    );
                  }
                  // Noté : on souligne ce qui est nettement sous la moyenne,
                  // c'est ce qu'on cherche en parcourant un tableau de promo.
                  const weak = c.maxScore > 0 && cell.score / c.maxScore < 0.5;
                  return (
                    <td key={c.exerciseId} className="px-3 py-2 tabular-nums">
                      <Link
                        href={`/admin/corrections/${cell.submissionId}`}
                        className={cn("underline underline-offset-2", weak ? "text-status-red" : "text-foreground")}
                      >
                        {cell.score}
                      </Link>
                    </td>
                  );
                })}

                <td className="px-3 py-2 text-right tabular-nums">
                  {row.pointsMax > 0 ? `${row.points} / ${row.pointsMax}` : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground-secondary">
                  {formatSeconds(row.seconds)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-foreground-secondary">
                  {row.attendanceTotal > 0 ? `${row.signed}/${row.attendanceTotal}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-foreground-tertiary">
        La colonne « Points » ne compte que les exercices corrigés : personne n&apos;est pénalisé
        pour une copie qui attend encore votre note.
      </p>
    </div>
  );
}
