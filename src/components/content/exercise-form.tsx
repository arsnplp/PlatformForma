"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ExerciseType, CorrectionMode } from "@/generated/prisma/enums";
import { EXERCISE_TYPES, EXERCISE_TYPE_KEYS, defaultConfig, type AnyConfig, type QcmConfig, type TrueFalseConfig, type ShortAnswerConfig, type LongTextConfig, type FileUploadConfig, type QuizConfig } from "@/lib/content/exercise-config";
import type { FormState } from "@/lib/actions/shared";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, FormError } from "@/components/admin/form-field";
import { NativeSelect } from "@/components/admin/native-select";

export type ExerciseInitial = {
  type: ExerciseType;
  title: string;
  statement: string;
  correctionMode: CorrectionMode;
  maxScore: number | null;
  config: AnyConfig;
};

// Formulaire d'exercice : le tronc commun est identique pour tous les types,
// seule la configuration change (spec §8.2 : choisir un type, remplir un formulaire).
export function ExerciseForm({
  action,
  initial,
  cancelHref,
  submitLabel,
}: {
  action: (input: unknown) => Promise<FormState>;
  initial?: ExerciseInitial;
  cancelHref: string;
  submitLabel: string;
}) {
  const [type, setType] = useState<ExerciseType>(initial?.type ?? "qcm");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [statement, setStatement] = useState(initial?.statement ?? "");
  const [maxScore, setMaxScore] = useState<string>(initial?.maxScore == null ? "" : String(initial.maxScore));
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>(initial?.correctionMode ?? "auto");
  const [config, setConfig] = useState<AnyConfig>(initial?.config ?? defaultConfig(initial?.type ?? "qcm"));
  const [state, setState] = useState<FormState>(undefined);
  const [pending, startTransition] = useTransition();

  const meta = EXERCISE_TYPES[type];

  function changeType(next: ExerciseType) {
    setType(next);
    setConfig(defaultConfig(next));
    setCorrectionMode(EXERCISE_TYPES[next].correction);
  }

  function submit() {
    startTransition(async () => {
      const result = await action({
        type, title, statement, correctionMode,
        maxScore: maxScore.trim() === "" ? null : Number(maxScore),
        config,
      });
      if (result) setState(result);
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <FormError message={state?.error} />

      <FormField id="type" label="Type d'exercice" hint={meta.hint}>
        <NativeSelect id="type" value={type} onChange={(e) => changeType(e.target.value as ExerciseType)}>
          {EXERCISE_TYPE_KEYS.map((k) => (
            <option key={k} value={k}>{EXERCISE_TYPES[k].label}</option>
          ))}
        </NativeSelect>
      </FormField>

      <FormField id="title" label="Titre" errors={state?.fieldErrors?.title}>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Exercice 1 — Repérer un usage fiable" required />
      </FormField>

      <FormField id="statement" label="Énoncé (Markdown)" hint="Ce que lit l'élève avant de répondre." errors={state?.fieldErrors?.statement}>
        <Textarea id="statement" value={statement} onChange={(e) => setStatement(e.target.value)} rows={5} className="font-mono text-[13px]" required />
      </FormField>

      <div className="space-y-4 rounded-lg border p-4">
        <p className="text-sm font-medium">Configuration · {meta.label}</p>
        {state?.fieldErrors?.config ? <p className="text-sm text-status-red">{state.fieldErrors.config.join(" ")}</p> : null}
        {type === "qcm" ? <QcmFields config={config as QcmConfig} onChange={setConfig} /> : null}
        {type === "true_false" ? <TrueFalseFields config={config as TrueFalseConfig} onChange={setConfig} /> : null}
        {type === "short_answer" ? <ShortAnswerFields config={config as ShortAnswerConfig} onChange={setConfig} /> : null}
        {type === "long_text" ? <LongTextFields config={config as LongTextConfig} onChange={setConfig} /> : null}
        {type === "file_upload" ? <FileUploadFields config={config as FileUploadConfig} onChange={setConfig} /> : null}
        {type === "quiz" ? <QuizFields config={config as QuizConfig} onChange={setConfig} /> : null}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <FormField id="maxScore" label="Barème (points)" hint="Laisser vide pour la valeur par défaut.">
          <Input id="maxScore" type="number" min={0} max={1000} value={maxScore} onChange={(e) => setMaxScore(e.target.value)} placeholder={type === "quiz" ? "somme des questions" : "1"} />
        </FormField>
        <FormField id="correctionMode" label="Correction" hint={meta.canBeManual ? "Ce type accepte les deux modes." : `Imposée pour ce type : ${meta.correction === "auto" ? "automatique" : "manuelle"}.`}>
          <NativeSelect id="correctionMode" value={correctionMode} onChange={(e) => setCorrectionMode(e.target.value as CorrectionMode)} disabled={!meta.canBeManual}>
            <option value="auto">Automatique</option>
            <option value="manual">Manuelle (formateur)</option>
          </NativeSelect>
        </FormField>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={submit} disabled={pending}>{pending ? "Enregistrement…" : submitLabel}</Button>
        <Button variant="ghost" asChild><Link href={cancelHref}>Annuler</Link></Button>
      </div>
    </div>
  );
}

// ── Champs par type ─────────────────────────────────────────────────────────

function QcmFields({ config, onChange }: { config: QcmConfig; onChange: (c: AnyConfig) => void }) {
  const set = (patch: Partial<QcmConfig>) => onChange({ ...config, ...patch });
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={config.multiple} onCheckedChange={(v) => set({ multiple: v === true })} />
        Plusieurs bonnes réponses possibles
      </label>
      <ul className="space-y-2">
        {config.options.map((opt, i) => (
          <li key={i} className="flex items-center gap-2">
            <Checkbox
              checked={opt.correct}
              onCheckedChange={(v) => {
                const options = config.options.map((o, j) =>
                  j === i ? { ...o, correct: v === true } : config.multiple ? o : { ...o, correct: false },
                );
                set({ options });
              }}
              aria-label={`Proposition ${i + 1} correcte`}
            />
            <Input
              value={opt.text}
              onChange={(e) => set({ options: config.options.map((o, j) => (j === i ? { ...o, text: e.target.value } : o)) })}
              placeholder={`Proposition ${i + 1}`}
            />
            <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" disabled={config.options.length <= 2}
              onClick={() => set({ options: config.options.filter((_, j) => j !== i) })}>Retirer</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => set({ options: [...config.options, { text: "", correct: false }] })}>
        Ajouter une proposition
      </Button>
      <p className="text-xs text-foreground-tertiary">Coche la ou les bonnes réponses.</p>
    </div>
  );
}

function TrueFalseFields({ config, onChange }: { config: TrueFalseConfig; onChange: (c: AnyConfig) => void }) {
  return (
    <NativeSelect value={String(config.answer)} onChange={(e) => onChange({ answer: e.target.value === "true" })} aria-label="Bonne réponse">
      <option value="true">L&apos;affirmation est vraie</option>
      <option value="false">L&apos;affirmation est fausse</option>
    </NativeSelect>
  );
}

function ShortAnswerFields({ config, onChange }: { config: ShortAnswerConfig; onChange: (c: AnyConfig) => void }) {
  const set = (patch: Partial<ShortAnswerConfig>) => onChange({ ...config, ...patch });
  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground-tertiary">Réponses acceptées : la réponse de l&apos;élève est correcte si elle correspond à l&apos;une d&apos;elles.</p>
      <ul className="space-y-2">
        {config.acceptedAnswers.map((a, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input value={a} onChange={(e) => set({ acceptedAnswers: config.acceptedAnswers.map((x, j) => (j === i ? e.target.value : x)) })} placeholder="Réponse acceptée" />
            <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" disabled={config.acceptedAnswers.length <= 1}
              onClick={() => set({ acceptedAnswers: config.acceptedAnswers.filter((_, j) => j !== i) })}>Retirer</Button>
          </li>
        ))}
      </ul>
      <Button type="button" variant="outline" size="sm" onClick={() => set({ acceptedAnswers: [...config.acceptedAnswers, ""] })}>Ajouter une réponse</Button>
      <div className="grid gap-3 sm:grid-cols-2">
        <NativeSelect value={config.match} onChange={(e) => set({ match: e.target.value as "exact" | "contains" })} aria-label="Comparaison">
          <option value="exact">Correspondance exacte</option>
          <option value="contains">La réponse contient le mot-clé</option>
        </NativeSelect>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={config.caseSensitive} onCheckedChange={(v) => set({ caseSensitive: v === true })} />
          Respecter les majuscules
        </label>
      </div>
    </div>
  );
}

function LongTextFields({ config, onChange }: { config: LongTextConfig; onChange: (c: AnyConfig) => void }) {
  const set = (patch: Partial<LongTextConfig>) => onChange({ ...config, ...patch });
  return (
    <div className="space-y-3">
      <FormField id="minWords" label="Nombre de mots minimum" hint="Laisser vide pour ne pas imposer de longueur.">
        <Input id="minWords" type="number" min={0} value={config.minWords ?? ""} onChange={(e) => set({ minWords: e.target.value === "" ? null : Number(e.target.value) })} />
      </FormField>
      <FormField id="guidance" label="Consigne de rédaction" hint="Affichée sous la zone de réponse.">
        <Textarea id="guidance" rows={2} value={config.guidance} onChange={(e) => set({ guidance: e.target.value })} />
      </FormField>
      <p className="text-xs text-foreground-tertiary">Correction manuelle : cet exercice arrivera dans la file « à corriger ».</p>
    </div>
  );
}

function FileUploadFields({ config, onChange }: { config: FileUploadConfig; onChange: (c: AnyConfig) => void }) {
  const set = (patch: Partial<FileUploadConfig>) => onChange({ ...config, ...patch });
  return (
    <div className="space-y-3">
      <FormField id="maxFiles" label="Nombre de fichiers attendus">
        <Input id="maxFiles" type="number" min={1} max={10} value={config.maxFiles} onChange={(e) => set({ maxFiles: Number(e.target.value) || 1 })} />
      </FormField>
      <FormField id="fu-guidance" label="Consigne" hint="Format attendu, nommage, contenu du livrable.">
        <Textarea id="fu-guidance" rows={2} value={config.guidance} onChange={(e) => set({ guidance: e.target.value })} />
      </FormField>
      <p className="text-xs text-foreground-tertiary">Correction manuelle : le livrable arrivera dans la file « à corriger ».</p>
    </div>
  );
}

function QuizFields({ config, onChange }: { config: QuizConfig; onChange: (c: AnyConfig) => void }) {
  const setQ = (i: number, patch: Partial<QuizConfig["questions"][number]>) =>
    onChange({ questions: config.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const total = config.questions.reduce((n, q) => n + (q.points ?? 1), 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-foreground-tertiary">{config.questions.length} question(s) · {total} point(s) au total</p>
      {config.questions.map((q, i) => (
        <div key={i} className="space-y-3 rounded-md border p-3">
          <div className="flex items-start gap-2">
            <span className="mt-2 font-mono text-xs text-foreground-tertiary">{i + 1}</span>
            <Input value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="Intitulé de la question" />
            <Button type="button" variant="ghost" size="sm" className="h-9 shrink-0" disabled={config.questions.length <= 1}
              onClick={() => onChange({ questions: config.questions.filter((_, j) => j !== i) })}>Retirer</Button>
          </div>
          <div className="grid gap-3 pl-6 sm:grid-cols-2">
            <NativeSelect
              value={q.kind}
              onChange={(e) => {
                const kind = e.target.value as "qcm" | "true_false";
                // Repasser en QCM repart de deux propositions vierges.
                setQ(i, kind === "qcm" ? { kind, options: q.options.length ? q.options : [{ text: "", correct: true }, { text: "", correct: false }] } : { kind, options: [] });
              }}
              aria-label={`Type question ${i + 1}`}
            >
              <option value="qcm">QCM</option>
              <option value="true_false">Vrai / Faux</option>
            </NativeSelect>
            <Input type="number" min={0} step={0.5} value={q.points} onChange={(e) => setQ(i, { points: Number(e.target.value) || 0 })} aria-label={`Points question ${i + 1}`} />
          </div>
          <div className="pl-6">
            {q.kind === "true_false" ? (
              <NativeSelect value={String(q.answer)} onChange={(e) => setQ(i, { answer: e.target.value === "true" })} aria-label={`Réponse question ${i + 1}`}>
                <option value="true">Vrai</option>
                <option value="false">Faux</option>
              </NativeSelect>
            ) : (
              <div className="space-y-2">
                {q.options.map((opt, k) => (
                  <div key={k} className="flex items-center gap-2">
                    <Checkbox checked={opt.correct} onCheckedChange={(v) => setQ(i, { options: q.options.map((o, m) => (m === k ? { ...o, correct: v === true } : { ...o, correct: false })) })} aria-label={`Bonne réponse ${k + 1}`} />
                    <Input value={opt.text} onChange={(e) => setQ(i, { options: q.options.map((o, m) => (m === k ? { ...o, text: e.target.value } : o)) })} placeholder={`Proposition ${k + 1}`} />
                    <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0" disabled={q.options.length <= 2}
                      onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k) })}>Retirer</Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setQ(i, { options: [...q.options, { text: "", correct: false }] })}>Ajouter une proposition</Button>
              </div>
            )}
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => onChange({ questions: [...config.questions, { text: "", kind: "qcm", points: 1, options: [{ text: "", correct: true }, { text: "", correct: false }], answer: true }] })}>
        Ajouter une question
      </Button>
    </div>
  );
}
