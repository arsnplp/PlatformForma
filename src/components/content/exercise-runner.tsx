"use client";

import { useState, useTransition } from "react";
import { submitAnswer } from "@/lib/actions/submissions";
import type { Answer } from "@/lib/content/grading";
import { EXERCISE_TYPES } from "@/lib/content/exercise-config";
import type { QcmConfig, ShortAnswerConfig, LongTextConfig, QuizConfig, FileUploadConfig } from "@/lib/content/exercise-config";
import type { ExerciseType } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";

type Config = QcmConfig | ShortAnswerConfig | LongTextConfig | QuizConfig | FileUploadConfig | { answer: boolean };

// Passage d'un exercice par l'élève. Une réponse est définitive : on demande
// confirmation avant d'envoyer, puis le résultat s'affiche si la correction
// est automatique.
export function ExerciseRunner({
  exerciseId,
  sessionId,
  type,
  config,
  maxScore,
}: {
  exerciseId: string;
  sessionId: string;
  type: ExerciseType;
  config: Config;
  maxScore: number;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const [boolValue, setBoolValue] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number[] | boolean>>({});
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const meta = EXERCISE_TYPES[type];

  if (type === "file_upload") {
    return (
      <p className="rounded-md bg-surface px-3 py-2 text-sm text-foreground-secondary">
        Le dépôt de fichier arrive prochainement. Remettez votre livrable à votre formateur en attendant.
      </p>
    );
  }

  function buildAnswer(): Answer | null {
    if (type === "qcm") return selected.length > 0 ? { kind: "qcm", selected } : null;
    if (type === "true_false") return boolValue === null ? null : { kind: "true_false", value: boolValue };
    if (type === "short_answer") return text.trim() ? { kind: "short_answer", text } : null;
    if (type === "long_text") return text.trim() ? { kind: "long_text", text } : null;
    if (type === "quiz") {
      const questions = (config as QuizConfig).questions;
      const answers = questions.map((q, i) => {
        const given = quizAnswers[i];
        if (q.kind === "true_false") return { value: typeof given === "boolean" ? given : false };
        return { selected: Array.isArray(given) ? given : [] };
      });
      const complete = questions.every((q, i) => {
        const g = quizAnswers[i];
        return q.kind === "true_false" ? typeof g === "boolean" : Array.isArray(g) && g.length > 0;
      });
      return complete ? { kind: "quiz", answers } : null;
    }
    return null;
  }

  const answer = buildAnswer();
  const minWords = type === "long_text" ? ((config as LongTextConfig).minWords ?? 0) : 0;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const tooShort = minWords > 0 && words < minWords;

  function send() {
    const a = buildAnswer();
    if (!a) return;
    startTransition(async () => {
      const result = await submitAnswer(exerciseId, sessionId, a);
      if (result?.error) { setError(result.error); setConfirming(false); }
    });
  }

  return (
    <div className="space-y-4">
      {type === "qcm" ? (
        <ul className="space-y-2">
          {(config as QcmConfig).options.map((opt, i) => {
            const multiple = (config as QcmConfig).multiple;
            const checked = selected.includes(i);
            return (
              <li key={i}>
                <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors", checked ? "border-brand bg-brand-soft" : "hover:bg-surface")}>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => setSelected(multiple ? (v === true ? [...selected, i] : selected.filter((x) => x !== i)) : v === true ? [i] : [])}
                    className="mt-0.5"
                  />
                  <span>{opt.text}</span>
                </label>
              </li>
            );
          })}
          {(config as QcmConfig).multiple ? <li className="text-xs text-foreground-tertiary">Plusieurs réponses possibles.</li> : null}
        </ul>
      ) : null}

      {type === "true_false" ? (
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => setBoolValue(v)}
              className={cn("rounded-md border px-4 py-2 text-sm transition-colors", boolValue === v ? "border-brand bg-brand-soft font-medium" : "hover:bg-surface")}
            >
              {v ? "Vrai" : "Faux"}
            </button>
          ))}
        </div>
      ) : null}

      {type === "short_answer" ? (
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre réponse" className="max-w-md" />
      ) : null}

      {type === "long_text" ? (
        <div className="space-y-1">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} placeholder="Votre réponse" />
          <p className="text-xs text-foreground-tertiary">
            {words} mot{words > 1 ? "s" : ""}
            {minWords > 0 ? ` · ${minWords} minimum` : ""}
            {(config as LongTextConfig).guidance ? ` · ${(config as LongTextConfig).guidance}` : ""}
          </p>
        </div>
      ) : null}

      {type === "quiz" ? (
        <ol className="space-y-4">
          {(config as QuizConfig).questions.map((q, i) => (
            <li key={i} className="space-y-2">
              <p className="text-sm font-medium">
                <span className="mr-2 font-mono text-xs text-foreground-tertiary">{i + 1}</span>
                {q.text}
                <span className="ml-2 text-xs font-normal text-foreground-tertiary">{q.points} pt</span>
              </p>
              {q.kind === "true_false" ? (
                <div className="flex gap-2 pl-6">
                  {[true, false].map((v) => (
                    <button key={String(v)} type="button" onClick={() => setQuizAnswers({ ...quizAnswers, [i]: v })}
                      className={cn("rounded-md border px-3 py-1.5 text-sm transition-colors", quizAnswers[i] === v ? "border-brand bg-brand-soft font-medium" : "hover:bg-surface")}>
                      {v ? "Vrai" : "Faux"}
                    </button>
                  ))}
                </div>
              ) : (
                <ul className="space-y-1.5 pl-6">
                  {q.options.map((opt, k) => {
                    const checked = Array.isArray(quizAnswers[i]) && (quizAnswers[i] as number[]).includes(k);
                    return (
                      <li key={k}>
                        <label className={cn("flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm transition-colors", checked ? "border-brand bg-brand-soft" : "hover:bg-surface")}>
                          <Checkbox checked={checked} onCheckedChange={() => setQuizAnswers({ ...quizAnswers, [i]: [k] })} className="mt-0.5" />
                          <span>{opt.text}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      {error ? <p className="rounded-md bg-status-red-bg px-3 py-2 text-sm text-status-red">{error}</p> : null}

      {confirming ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
          <p className="text-sm">
            Envoyer votre réponse ? <span className="text-foreground-secondary">Elle sera définitive.</span>
          </p>
          <span className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>Annuler</Button>
            <Button type="button" size="sm" onClick={send} disabled={pending}>{pending ? "Envoi…" : "Confirmer"}</Button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => setConfirming(true)} disabled={!answer || tooShort}>Répondre</Button>
          <span className="text-xs text-foreground-tertiary">
            {meta.correction === "auto" ? `Correction immédiate · ${maxScore} point(s)` : "Corrigé par votre formateur"}
            {tooShort ? ` · encore ${minWords - words} mot(s)` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// Résultat d'une réponse déjà envoyée.
export function ExerciseResult({
  status,
  score,
  max,
  details,
  feedback,
}: {
  status: string;
  score: number | null;
  max: number;
  details: { index: number; correct: boolean; points: number; expected?: string }[] | null;
  feedback: string | null;
}) {
  if (status !== "graded") {
    return (
      <div className="rounded-md bg-status-yellow-bg px-3 py-2 text-sm text-status-yellow">
        Réponse envoyée. Votre formateur la corrigera prochainement.
      </div>
    );
  }
  const ratio = max > 0 && score !== null ? score / max : 0;
  const tone = ratio >= 1 ? "green" : ratio > 0 ? "yellow" : "red";
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-sm">
        <StatusBadge tone={tone}>{score ?? 0} / {max}</StatusBadge>
        <span className="text-foreground-secondary">{ratio >= 1 ? "Tout juste." : ratio > 0 ? "Partiellement juste." : "À revoir."}</span>
      </p>
      {details && details.length > 0 ? (
        <ul className="space-y-1 text-sm">
          {details.map((d) => (
            <li key={d.index} className="flex items-start gap-2">
              <span className={d.correct ? "text-status-green" : "text-status-red"}>{d.correct ? "✓" : "✗"}</span>
              <span className="text-foreground-secondary">
                {details.length > 1 ? `Question ${d.index + 1} · ` : ""}
                {d.correct ? "juste" : `attendu : ${d.expected || "—"}`}
                {d.points > 0 ? ` · ${d.points} pt` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {feedback ? <p className="rounded-md bg-surface px-3 py-2 text-sm">{feedback}</p> : null}
    </div>
  );
}
