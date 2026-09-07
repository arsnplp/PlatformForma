import type { GradeDetail } from "./grading";

export type SubmissionFile = { path: string; name: string; mimeType: string; sizeBytes: number };

// Lecture défensive du contenu d'une soumission (JSON en base).
export function readSubmissionFiles(content: unknown): SubmissionFile[] {
  if (!content || typeof content !== "object") return [];
  const answer = (content as Record<string, unknown>).answer;
  if (!answer || typeof answer !== "object") return [];
  const files = (answer as Record<string, unknown>).files;
  if (!Array.isArray(files)) return [];
  return files.flatMap((f) => {
    if (!f || typeof f !== "object") return [];
    const o = f as Record<string, unknown>;
    const path = typeof o.path === "string" ? o.path : null;
    const name = typeof o.name === "string" ? o.name : null;
    const mimeType = typeof o.mimeType === "string" ? o.mimeType : "application/octet-stream";
    const sizeBytes = typeof o.sizeBytes === "number" ? o.sizeBytes : 0;
    return path && name ? [{ path, name, mimeType, sizeBytes }] : [];
  });
}

export function readSubmissionText(content: unknown): string {
  if (!content || typeof content !== "object") return "";
  const answer = (content as Record<string, unknown>).answer;
  if (!answer || typeof answer !== "object") return "";
  const text = (answer as Record<string, unknown>).text;
  return typeof text === "string" ? text : "";
}

export function readGrade(content: unknown): { score: number; max: number; details: GradeDetail[] } | null {
  if (!content || typeof content !== "object") return null;
  const grade = (content as Record<string, unknown>).grade;
  if (!grade || typeof grade !== "object") return null;
  const g = grade as Record<string, unknown>;
  if (typeof g.score !== "number" || typeof g.max !== "number") return null;
  return { score: g.score, max: g.max, details: Array.isArray(g.details) ? (g.details as GradeDetail[]) : [] };
}
