import { z } from "zod";
import { ExerciseType, CorrectionMode } from "@/generated/prisma/enums";

// Types d'exercices (spec §8.2). Chaque type a sa configuration et son mode de
// correction par défaut ; l'énoncé est du Markdown, rendu comme le reste.
export const EXERCISE_TYPES: Record<ExerciseType, { label: string; hint: string; correction: CorrectionMode; canBeManual?: boolean }> = {
  qcm: { label: "QCM", hint: "Une question, plusieurs propositions", correction: "auto" },
  true_false: { label: "Vrai / Faux", hint: "Une affirmation à trancher", correction: "auto" },
  short_answer: { label: "Réponse courte", hint: "Quelques mots, corrigés par mot-clé", correction: "auto", canBeManual: true },
  long_text: { label: "Texte long", hint: "Rédaction, cas pratique", correction: "manual" },
  file_upload: { label: "Dépôt de fichier", hint: "Livrable à rendre", correction: "manual" },
  quiz: { label: "Quiz noté", hint: "Plusieurs questions, note automatique", correction: "auto" },
};

export const EXERCISE_TYPE_KEYS = Object.keys(EXERCISE_TYPES) as ExerciseType[];

// ── Configuration par type ──────────────────────────────────────────────────

const optionSchema = z.object({ text: z.string().trim().min(1, "Proposition vide"), correct: z.boolean() });

export const qcmConfig = z.object({
  options: z.array(optionSchema).min(2, "Au moins deux propositions"),
  multiple: z.boolean().default(false),
}).refine((c) => c.options.some((o) => o.correct), { message: "Coche au moins une bonne réponse", path: ["options"] })
  .refine((c) => c.multiple || c.options.filter((o) => o.correct).length === 1, { message: "Une seule bonne réponse, ou active le choix multiple", path: ["options"] });

export const trueFalseConfig = z.object({ answer: z.boolean() });

export const shortAnswerConfig = z.object({
  acceptedAnswers: z.array(z.string().trim().min(1)).min(1, "Au moins une réponse acceptée"),
  caseSensitive: z.boolean().default(false),
  match: z.enum(["exact", "contains"]).default("exact"),
});

export const longTextConfig = z.object({
  minWords: z.number().int().min(0).max(5000).nullable().default(null),
  guidance: z.string().trim().default(""),
});

export const fileUploadConfig = z.object({
  guidance: z.string().trim().default(""),
  maxFiles: z.number().int().min(1).max(10).default(1),
});

// Dans un quiz, une question Vrai/Faux peut conserver des propositions vides
// (héritage du basculement de type) : elles sont ignorées, pas refusées.
const quizOptionSchema = z.object({ text: z.string().trim(), correct: z.boolean() });

const quizQuestionSchema = z.object({
  text: z.string().trim().min(1, "Question vide"),
  kind: z.enum(["qcm", "true_false"]),
  points: z.number().min(0).max(100).default(1),
  options: z.array(quizOptionSchema).default([]),
  answer: z.boolean().default(true),
})
  .transform((q) => (q.kind === "true_false" ? { ...q, options: [] } : { ...q, options: q.options.filter((o) => o.text.length > 0) }))
  .refine((q) => q.kind !== "qcm" || (q.options.length >= 2 && q.options.some((o) => o.correct)), {
    message: "Chaque QCM du quiz demande au moins deux propositions et une bonne réponse",
    path: ["options"],
  });

export const quizConfig = z.object({ questions: z.array(quizQuestionSchema).min(1, "Au moins une question") });

export const CONFIG_SCHEMAS = {
  qcm: qcmConfig,
  true_false: trueFalseConfig,
  short_answer: shortAnswerConfig,
  long_text: longTextConfig,
  file_upload: fileUploadConfig,
  quiz: quizConfig,
} as const;

export type QcmConfig = z.infer<typeof qcmConfig>;
export type TrueFalseConfig = z.infer<typeof trueFalseConfig>;
export type ShortAnswerConfig = z.infer<typeof shortAnswerConfig>;
export type LongTextConfig = z.infer<typeof longTextConfig>;
export type FileUploadConfig = z.infer<typeof fileUploadConfig>;
export type QuizConfig = z.infer<typeof quizConfig>;
export type AnyConfig = QcmConfig | TrueFalseConfig | ShortAnswerConfig | LongTextConfig | FileUploadConfig | QuizConfig;

export function defaultConfig(type: ExerciseType): AnyConfig {
  switch (type) {
    case "qcm": return { options: [{ text: "", correct: true }, { text: "", correct: false }], multiple: false };
    case "true_false": return { answer: true };
    case "short_answer": return { acceptedAnswers: [""], caseSensitive: false, match: "exact" };
    case "long_text": return { minWords: null, guidance: "" };
    case "file_upload": return { guidance: "", maxFiles: 1 };
    case "quiz": return { questions: [{ text: "", kind: "qcm", points: 1, options: [{ text: "", correct: true }, { text: "", correct: false }], answer: true }] };
  }
}

export function parseConfig(type: ExerciseType, raw: unknown) {
  return CONFIG_SCHEMAS[type].safeParse(raw);
}

// Barème par défaut : 1 point, ou la somme des points du quiz.
export function defaultMaxScore(type: ExerciseType, config: AnyConfig): number {
  if (type === "quiz") return (config as QuizConfig).questions.reduce((n, q) => n + (q.points ?? 1), 0);
  return 1;
}
