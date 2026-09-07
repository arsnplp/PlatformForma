"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { gradeSubmission } from "@/lib/actions/grading";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField, FormError } from "@/components/admin/form-field";

// Note et retour individuel. Le retour est visible par l'élève dès l'enregistrement.
export function GradeForm({
  submissionId,
  maxScore,
  initialScore,
  initialFeedback,
}: {
  submissionId: string;
  maxScore: number;
  initialScore: number | null;
  initialFeedback: string;
}) {
  const router = useRouter();
  const [score, setScore] = useState(initialScore == null ? "" : String(initialScore));
  const [feedback, setFeedback] = useState(initialFeedback);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await gradeSubmission(submissionId, { score: Number(score), feedback });
      if (result?.error) { setError(result.error); return; }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <FormError message={error ?? undefined} />
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <FormField id="score" label={`Note sur ${maxScore}`}>
          <Input id="score" type="number" min={0} max={maxScore} step={0.5} value={score} onChange={(e) => { setScore(e.target.value); setSaved(false); }} />
        </FormField>
        <FormField id="feedback" label="Retour individuel" hint="Lu par l'élève dans son espace.">
          <Textarea id="feedback" rows={5} value={feedback} onChange={(e) => { setFeedback(e.target.value); setSaved(false); }} placeholder="Ce qui est acquis, ce qui reste à travailler…" />
        </FormField>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" onClick={save} disabled={pending || score === ""}>{pending ? "Enregistrement…" : "Enregistrer la correction"}</Button>
        {saved ? <span className="text-sm text-status-green">Correction enregistrée, visible par l&apos;élève.</span> : null}
      </div>
    </div>
  );
}
