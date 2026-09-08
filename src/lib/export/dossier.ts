import "server-only";

import { ZipArchive } from "archiver";
import { prisma } from "@/lib/prisma";
import { downloadFile } from "@/lib/storage/client";
import { DOCUMENT_BUCKET, safeFileName } from "@/lib/storage/config";
import { phaseLabel } from "@/lib/labels";
import { buildManifest, type ManifestEntry } from "./manifest";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";

// Dossier de preuve (spec §10.2) : ZIP classé par session → phase → type,
// précédé d'un manifeste. L'archive est STREAMÉE : on ne monte jamais le
// dossier entier en mémoire, seulement la pièce en cours de copie.

export type ExportScope =
  | { kind: "student"; userId: string; sessionId?: string }
  | { kind: "session"; sessionId: string };

type Piece = {
  id: string;
  storagePath: string;
  title: string;
  type: ManifestEntry["type"];
  phase: number | null;
  createdAt: Date;
  signatureStatus: ManifestEntry["signatureStatus"];
  signedAt: Date | null;
  isDemo: boolean;
  sessionLabel: string;
  holder: string | null;
};

// Périmètre autorisé : on n'exporte que ce que l'utilisateur a le droit de voir.
function sessionScope(me: CurrentUser) {
  return canSupervise(me) ? {} : { OR: [{ ownerId: me.id }, { trainerId: me.id }] };
}

export async function collectPieces(scope: ExportScope, me: CurrentUser): Promise<{
  pieces: Piece[];
  title: string;
  subtitle: string;
  isDemo: boolean;
  fileName: string;
}> {
  if (scope.kind === "session") {
    const session = await prisma.session.findFirst({
      where: { id: scope.sessionId, ...sessionScope(me) },
      select: {
        id: true, name: true, isDemo: true, startDate: true, endDate: true,
        company: { select: { name: true } },
        formationVersion: { select: { versionNumber: true, formation: { select: { name: true } } } },
      },
    });
    if (!session) throw new Error("Session introuvable");

    const documents = await loadDocuments({ sessionId: session.id });
    const label = `${session.formationVersion.formation.name} — ${session.name}`;
    return {
      pieces: documents.map((d) => toPiece(d, label)),
      title: `Session — ${session.name}`,
      subtitle: `${session.formationVersion.formation.name} (v${session.formationVersion.versionNumber})${session.company ? ` — ${session.company.name}` : ""}`,
      isDemo: session.isDemo,
      fileName: `Dossier_session_${clean(session.name)}`,
    };
  }

  const student = await prisma.user.findUnique({ where: { id: scope.userId }, select: { id: true, name: true, email: true } });
  if (!student) throw new Error("Élève introuvable");

  // Ses sessions, dans mon périmètre seulement.
  const enrollments = await prisma.enrollment.findMany({
    where: { userId: student.id, session: sessionScope(me), ...(scope.sessionId ? { sessionId: scope.sessionId } : {}) },
    select: {
      session: {
        select: {
          id: true, name: true, isDemo: true,
          formationVersion: { select: { versionNumber: true, formation: { select: { name: true } } } },
        },
      },
    },
  });
  if (enrollments.length === 0) throw new Error("Aucune inscription accessible pour cet élève");

  const sessionIds = enrollments.map((e) => e.session.id);
  const labels = new Map(
    enrollments.map((e) => [e.session.id, `${e.session.formationVersion.formation.name} — ${e.session.name}`]),
  );

  // Ses pièces personnelles, plus les feuilles d'émargement et attestations des
  // demi-journées où il figure : c'est ce qui prouve sa présence.
  const attendanceDocIds = (
    await prisma.attendance.findMany({
      where: { userId: student.id, sessionId: { in: sessionIds }, documentId: { not: null } },
      select: { documentId: true },
    })
  ).map((a) => a.documentId!);

  const documents = await loadDocuments({
    OR: [
      // Ses pièces personnelles.
      { ownerUserId: student.id, sessionId: { in: sessionIds } },
      // Les feuilles qu'il a signées.
      { id: { in: attendanceDocIds } },
      // Et les pièces de présence de ses sessions : attestations du formateur
      // pour les demi-journées closes, qui prouvent aussi sa présence.
      { sessionId: { in: sessionIds }, ownerUserId: null, companyId: null, type: { in: ["emargement", "attestation"] } },
    ],
  });

  return {
    pieces: documents.map((d) => toPiece(d, labels.get(d.sessionId ?? "") ?? "Hors session")),
    title: `Élève — ${student.name}`,
    subtitle: `${student.email} · ${enrollments.length} formation(s)`,
    isDemo: enrollments.every((e) => e.session.isDemo),
    fileName: `Dossier_${clean(student.name)}`,
  };
}

async function loadDocuments(where: Parameters<typeof prisma.document.findMany>[0] extends undefined ? never : NonNullable<Parameters<typeof prisma.document.findMany>[0]>["where"]) {
  return prisma.document.findMany({
    where: { ...where, archivedAt: null },
    orderBy: [{ sessionId: "asc" }, { phase: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, storagePath: true, title: true, type: true, phase: true, createdAt: true,
      signatureStatus: true, signedAt: true, isDemo: true, sessionId: true,
      owner: { select: { name: true } },
    },
  });
}

type LoadedDocument = Awaited<ReturnType<typeof loadDocuments>>[number];

function toPiece(d: LoadedDocument, sessionLabel: string): Piece {
  return {
    id: d.id, storagePath: d.storagePath, title: d.title, type: d.type, phase: d.phase,
    createdAt: d.createdAt, signatureStatus: d.signatureStatus, signedAt: d.signedAt,
    isDemo: d.isDemo, sessionLabel, holder: d.owner?.name ?? null,
  };
}

// Noms lisibles : safeFileName translittère chaque caractère, ce qui transforme
// « — » en trois tirets. On resserre, et on retire de chaque nom de fichier le
// nom de la session, déjà porté par le dossier parent.
function clean(value: string): string {
  return safeFileName(value).replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}

// Chemin d'une pièce dans l'archive : session → phase → fichier.
function entryPath(piece: Piece, index: number): string {
  const phase = piece.phase !== null ? `P${piece.phase}_${clean(phaseLabel(piece.phase))}` : "Sans_phase";
  const extension = piece.storagePath.match(/\.[a-z0-9]+$/i)?.[0] ?? ".pdf";
  const short = piece.title.split(" — ").filter((part) => part !== piece.sessionLabel.split(" — ").at(-1)).join(" — ");
  const name = `${String(index).padStart(2, "0")}_${clean(short)}`.replace(/\.[a-z0-9]+$/i, "");
  return `${clean(piece.sessionLabel)}/${phase}/${name}${extension}`;
}

// Flux ZIP : chaque pièce est copiée une par une, jamais toutes en mémoire.
export function streamDossier(params: {
  pieces: Piece[];
  title: string;
  subtitle: string;
  isDemo: boolean;
  generatedBy: string;
}): ReadableStream<Uint8Array> {
  const archive = new ZipArchive({ zlib: { level: 9 } });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
      archive.on("end", () => controller.close());
      archive.on("warning", (err: Error) => console.warn("[export]", err.message));
      archive.on("error", (err: Error) => controller.error(err));

      void (async () => {
        const entries: ManifestEntry[] = [];
        let index = 1;

        for (const piece of params.pieces) {
          const file = await downloadFile(piece.storagePath, DOCUMENT_BUCKET);
          if (!file) continue;
          const path = entryPath(piece, index++);
          // Les pièces partent telles quelles. Le filigrane « données de
          // démonstration » a été retiré à la demande : voir DEPLOIEMENT.md,
          // watermarkDemo() reste disponible dans ./watermark pour le rétablir.
          archive.append(Buffer.from(file), { name: path });
          entries.push({
            path, title: piece.title, type: piece.type, phase: piece.phase,
            createdAt: piece.createdAt, signatureStatus: piece.signatureStatus,
            signedAt: piece.signedAt, holder: piece.holder, isDemo: piece.isDemo,
          });
        }

        const manifest = await buildManifest({
          title: params.title,
          subtitle: params.subtitle,
          scope: [
            "Pièces classées par session, puis par phase du process.",
            params.isDemo
              ? "Session de démonstration : aucune pièce de cette archive n'a de valeur probante."
              : "Les pièces signées portent leur page de preuve (horodatage et identité du signataire).",
          ],
          generatedBy: params.generatedBy,
          generatedAt: new Date(),
          isDemo: params.isDemo,
          entries,
        });
        archive.append(Buffer.from(manifest), { name: "manifest.pdf" });

        await archive.finalize();
      })();
    },
    cancel() {
      archive.abort();
    },
  });
}
