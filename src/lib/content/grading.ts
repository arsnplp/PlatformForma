import { ExerciseType } from "@/generated/prisma/enums";
import { parseConfig, type QcmConfig, type TrueFalseConfig, type ShortAnswerConfig, type QuizConfig } from "./exercise-config";

// Réponse d'un élève, selon le type d'exercice.
export type Answer =
  | { kind: "qcm"; selected: number[] }
  | { kind: "true_false"; value: boolean }
  | { kind: "short_answer"; text: string }
  | { kind: "long_text"; text: string }
  | { kind: "quiz"; answers: ({ selected: number[] } | { value: boolean })[] };

export type GradeDetail = { index: number; correct: boolean; points: number; expected?: string };
export type Grade = { score: number; max: number; details: GradeDetail[] };

const normalize = (s: string, caseSensitive: boolean) => {
  const t = s.trim().replace(/\s+/g, " ");
  return caseSensitive ? t : t.toLocaleLowerCase("fr");
};

function sameSet(a: number[], b: number[]): boolean {
  const x = [...new Set(a)].sort(), y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

function gradeShortAnswer(text: string, config: ShortAnswerConfig): boolean {
  const given = normalize(text, config.caseSensitive);
  return config.acceptedAnswers.some((raw) => {
    const expected = normalize(raw, config.caseSensitive);
    return config.match === "exact" ? given === expected : given.includes(expected);
  });
}

// Correction automatique (spec §8.2). Renvoie null si le type se corrige à la main.
export function gradeAnswer(type: ExerciseType, rawConfig: unknown, answer: Answer, maxScore: number): Grade | null {
  const parsed = parseConfig(type, rawConfig);
  if (!parsed.success) return null;

  if (type === "qcm" && answer.kind === "qcm") {
    const config = parsed.data as QcmConfig;
    const expected = config.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0);
    const correct = sameSet(answer.selected, expected);
    return {
      score: correct ? maxScore : 0,
      max: maxScore,
      details: [{ index: 0, correct, points: correct ? maxScore : 0, expected: expected.map((i) => config.options[i].text).join(", ") }],
    };
  }

  if (type === "true_false" && answer.kind === "true_false") {
    const config = parsed.data as TrueFalseConfig;
    const correct = answer.value === config.answer;
    return { score: correct ? maxScore : 0, max: maxScore, details: [{ index: 0, correct, points: correct ? maxScore : 0, expected: config.answer ? "Vrai" : "Faux" }] };
  }

  if (type === "short_answer" && answer.kind === "short_answer") {
    const config = parsed.data as ShortAnswerConfig;
    const correct = gradeShortAnswer(answer.text, config);
    return { score: correct ? maxScore : 0, max: maxScore, details: [{ index: 0, correct, points: correct ? maxScore : 0, expected: config.acceptedAnswers.join(" · ") }] };
  }

  if (type === "quiz" && answer.kind === "quiz") {
    const config = parsed.data as QuizConfig;
    let score = 0;
    const details: GradeDetail[] = config.questions.map((q, i) => {
      const given = answer.answers[i];
      let correct = false;
      let expected = "";
      if (q.kind === "true_false") {
        expected = q.answer ? "Vrai" : "Faux";
        correct = Boolean(given && "value" in given && given.value === q.answer);
      } else {
        const wanted = q.options.map((o, j) => (o.correct ? j : -1)).filter((j) => j >= 0);
        expected = wanted.map((j) => q.options[j].text).join(", ");
        correct = Boolean(given && "selected" in given && sameSet(given.selected, wanted));
      }
      const points = correct ? (q.points ?? 1) : 0;
      score += points;
      return { index: i, correct, points, expected };
    });
    const max = config.questions.reduce((n, q) => n + (q.points ?? 1), 0);
    return { score, max, details };
  }

  return null; // texte long, dépôt de fichier : correction par le formateur
}
