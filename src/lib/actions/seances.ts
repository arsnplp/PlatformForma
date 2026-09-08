"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission, type CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { readVisio, parseJoinUrl } from "@/lib/content/block-payload";

export type SeanceState = { ok: boolean; message: string };

const planSchema = z.object({
  sessionId: z.string().uuid(),
  contentBlockId: z.string().uuid(),
  // Saisi depuis un champ datetime-local, donc en heure locale du formateur.
  startsAt: z.string().min(1, "Date et heure requises"),
  joinUrl: z.string().min(1, "Lien requis"),
});

async function loadManagedSession(sessionId: string, me: CurrentUser) {
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    select: { id: true, status: true, ownerId: true, trainerId: true, formationVersionId: true },
  });
  if (!session) throw new Error("Session introuvable");
  if (!canSupervise(me) && session.ownerId !== me.id && session.trainerId !== me.id) {
    throw new Error("Session introuvable");
  }
  return session;
}

// Planifie (ou replanifie) une séance : c'est ici que la date et le lien
// entrent, session par session. Le bloc de contenu, lui, reste le modèle.
export async function planSeance(input: z.input<typeof planSchema>): Promise<SeanceState> {
  const me = await requirePermission("can_manage_sessions");
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const session = await loadManagedSession(parsed.data.sessionId, me);
  if (session.status === "cancelled") return { ok: false, message: "Session annulée." };

  // Le bloc doit appartenir à la version que cette session a figée.
  const block = await prisma.contentBlock.findFirst({
    where: {
      id: parsed.data.contentBlockId,
      type: "visio",
      lesson: { module: { formationVersionId: session.formationVersionId } },
    },
    select: { id: true, payload: true },
  });
  if (!block) return { ok: false, message: "Séance introuvable dans le programme de cette session." };

  const visio = readVisio(block.payload);
  if (!visio) return { ok: false, message: "Séance mal configurée." };

  const joinUrl = parseJoinUrl(parsed.data.joinUrl);
  if (!joinUrl) return { ok: false, message: "Le lien doit être une adresse https complète." };

  const startsAt = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAt.getTime())) return { ok: false, message: "Date invalide." };

  await prisma.seance.upsert({
    where: { sessionId_contentBlockId: { sessionId: session.id, contentBlockId: block.id } },
    create: {
      sessionId: session.id, contentBlockId: block.id,
      startsAt, durationMinutes: visio.durationMinutes, joinUrl,
    },
    update: { startsAt, durationMinutes: visio.durationMinutes, joinUrl },
  });

  revalidateSeances(session.id);
  return { ok: true, message: "Séance planifiée." };
}

// Déplanifier : possible tant que personne n'a émargé — un émargement est du vécu.
export async function unplanSeance(seanceId: string): Promise<SeanceState> {
  const me = await requirePermission("can_manage_sessions");
  const seance = await prisma.seance.findUnique({
    where: { id: seanceId },
    select: { id: true, sessionId: true, _count: { select: { attendances: true } } },
  });
  if (!seance) return { ok: false, message: "Séance introuvable." };
  await loadManagedSession(seance.sessionId, me);

  if (seance._count.attendances > 0) {
    return { ok: false, message: "L'émargement de cette séance est ouvert : elle ne peut plus être déplanifiée." };
  }
  await prisma.seance.delete({ where: { id: seanceId } });
  revalidateSeances(seance.sessionId);
  return { ok: true, message: "Séance retirée du calendrier." };
}

function revalidateSeances(sessionId: string) {
  revalidatePath(`/admin/sessions/${sessionId}`);
  revalidatePath(`/espace/sessions/${sessionId}`);
  revalidatePath("/espace");
}
