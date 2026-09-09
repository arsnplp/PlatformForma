import "server-only";

import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { prisma } from "@/lib/prisma";
import { getSessionResults, formatSeconds } from "@/lib/queries/results";
import { listStudentSlots } from "@/lib/queries/slots";
import { formatDate } from "@/lib/format";
import { has, sessionScope, ownedScope, json, refuse, type ToolContext } from "./context";

// Les outils qui LISENT. Chacun se limite au périmètre de l'utilisateur :
// hors de son périmètre, une donnée n'existe simplement pas pour lui.
export function readTools(ctx: ToolContext) {
  const { me } = ctx;

  const chercherEleves = betaZodTool({
    name: "chercher_eleves",
    description:
      "Cherche des élèves par nom ou email et renvoie leurs inscriptions. À utiliser dès qu'une question porte sur une personne, pour retrouver son identifiant.",
    inputSchema: z.object({
      recherche: z.string().describe("Fragment de nom ou d'email. Vide pour lister les derniers inscrits."),
    }),
    run: async ({ recherche }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas accès aux élèves.");
      const q = recherche.trim();
      const users = await prisma.user.findMany({
        where: {
          archivedAt: null,
          enrollments: { some: { session: sessionScope(me) } },
          ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
        },
        take: 20,
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, email: true,
          company: { select: { name: true } },
          enrollments: {
            select: { status: true, session: { select: { id: true, name: true, status: true } } },
          },
        },
      });
      return json(users.map((u) => ({
        id: u.id, nom: u.name, email: u.email, entreprise: u.company?.name ?? null,
        inscriptions: u.enrollments.map((e) => ({
          session: e.session.name, sessionId: e.session.id, statut: e.status,
        })),
      })));
    },
  });

  const ficheEleve = betaZodTool({
    name: "fiche_eleve",
    description:
      "Dossier complet d'un élève : ses inscriptions, ses notes, son temps de connexion, ses pièces et ce qu'on attend encore de lui.",
    inputSchema: z.object({ eleveId: z.string().describe("Identifiant de l'élève") }),
    run: async ({ eleveId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas accès aux élèves.");
      // Le périmètre : un élève inscrit à l'une de mes sessions.
      const student = await prisma.user.findFirst({
        where: { id: eleveId, enrollments: { some: { session: sessionScope(me) } } },
        select: {
          id: true, name: true, email: true,
          company: { select: { name: true } },
          enrollments: {
            select: {
              status: true,
              session: { select: { id: true, name: true, status: true, startDate: true, endDate: true } },
            },
          },
          submissions: {
            orderBy: { submittedAt: "desc" },
            select: {
              status: true, autoScore: true, manualScore: true, submittedAt: true,
              exercise: { select: { title: true, maxScore: true } },
              session: { select: { name: true } },
            },
          },
          documentsOwned: {
            where: { archivedAt: null },
            select: { title: true, signatureStatus: true, createdAt: true },
          },
        },
      });
      if (!student) return refuse("Élève introuvable dans votre périmètre.");

      const slots = (
        await Promise.all(
          student.enrollments.map((e) => listStudentSlots(e.session.id, student.id)),
        )
      ).flat();

      return json({
        id: student.id, nom: student.name, email: student.email,
        entreprise: student.company?.name ?? null,
        inscriptions: student.enrollments.map((e) => ({
          session: e.session.name, sessionId: e.session.id, statut: e.status,
          du: formatDate(e.session.startDate), au: formatDate(e.session.endDate),
        })),
        exercices: student.submissions.map((s) => ({
          exercice: s.exercise.title, session: s.session.name,
          note: s.manualScore?.toString() ?? s.autoScore?.toString() ?? null,
          bareme: s.exercise.maxScore, statut: s.status === "graded" ? "corrigé" : "à corriger",
          rendu_le: formatDate(s.submittedAt),
        })),
        pieces: student.documentsOwned.map((d) => ({
          titre: d.title, signature: d.signatureStatus, depose_le: formatDate(d.createdAt),
        })),
        en_attente_de_lui: slots.filter((s) => s.waitingOnHolder).map((s) => ({
          quoi: s.title, nature: s.kind === "to_sign" ? "à signer" : "à fournir",
        })),
      });
    },
  });

  const listerSessions = betaZodTool({
    name: "lister_sessions",
    description: "Liste les sessions de son périmètre, avec leurs dates, leur statut et leur effectif.",
    inputSchema: z.object({
      recherche: z.string().optional().describe("Fragment du nom de la session ou de la formation"),
      statut: z.enum(["planned", "running", "done", "cancelled"]).optional(),
    }),
    run: async ({ recherche, statut }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas accès aux sessions.");
      const sessions = await prisma.session.findMany({
        where: {
          ...sessionScope(me),
          ...(statut ? { status: statut } : {}),
          ...(recherche
            ? {
                OR: [
                  { name: { contains: recherche, mode: "insensitive" } },
                  { formationVersion: { formation: { name: { contains: recherche, mode: "insensitive" } } } },
                ],
              }
            : {}),
        },
        orderBy: { startDate: "desc" },
        take: 25,
        select: {
          id: true, name: true, status: true, startDate: true, endDate: true, durationHours: true,
          company: { select: { name: true } },
          trainer: { select: { name: true } },
          formationVersion: { select: { versionNumber: true, formation: { select: { name: true } } } },
          _count: { select: { enrollments: true } },
        },
      });
      return json(sessions.map((s) => ({
        id: s.id, nom: s.name, statut: s.status,
        formation: `${s.formationVersion.formation.name} (v${s.formationVersion.versionNumber})`,
        du: formatDate(s.startDate), au: formatDate(s.endDate),
        heures: s.durationHours, entreprise: s.company?.name ?? null,
        formateur: s.trainer?.name ?? null, inscrits: s._count.enrollments,
      })));
    },
  });

  const resultatsSession = betaZodTool({
    name: "resultats_session",
    description:
      "Tableau des résultats d'une session : par élève, ce qui est rendu, corrigé, la note, le temps de connexion et les émargements.",
    inputSchema: z.object({ sessionId: z.string() }),
    run: async ({ sessionId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas accès aux sessions.");
      const session = await prisma.session.findFirst({
        where: { id: sessionId, ...sessionScope(me) },
        select: { id: true, name: true },
      });
      if (!session) return refuse("Session introuvable dans votre périmètre.");

      const results = await getSessionResults(session.id);
      return json({
        session: session.name,
        exercices: results.columns.map((c) => ({ titre: c.title, bareme: c.maxScore, place: c.place })),
        eleves: results.rows.map((r) => ({
          nom: r.name,
          points: r.pointsMax > 0 ? `${r.points} / ${r.pointsMax}` : null,
          rendus: r.submitted, corriges: r.graded,
          a_corriger: [...r.cells.values()].filter((c) => c.state === "submitted").length,
          temps_connexion: formatSeconds(r.seconds),
          emargements: r.attendanceTotal > 0 ? `${r.signed}/${r.attendanceTotal}` : null,
        })),
      });
    },
  });

  const listerFormations = betaZodTool({
    name: "lister_formations",
    description: "Liste les formations et leurs versions, avec le nombre de modules et de leçons.",
    inputSchema: z.object({ recherche: z.string().optional() }),
    run: async ({ recherche }) => {
      if (!has(me, "can_edit_formation")) return refuse("Vous n'avez pas accès aux formations.");
      const scope = ownedScope(me);
      const formations = await prisma.formation.findMany({
        where: {
          ...scope, archivedAt: null,
          ...(recherche ? { name: { contains: recherche, mode: "insensitive" } } : {}),
        },
        orderBy: { name: "asc" },
        take: 25,
        select: {
          id: true, name: true, sector: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            select: {
              id: true, versionNumber: true, status: true,
              _count: { select: { modules: true, sessions: true } },
            },
          },
        },
      });
      return json(formations.map((f) => ({
        id: f.id, nom: f.name, secteur: f.sector,
        versions: f.versions.map((v) => ({
          versionId: v.id, numero: v.versionNumber, statut: v.status,
          modules: v._count.modules, sessions: v._count.sessions,
        })),
      })));
    },
  });

  const aFaire = betaZodTool({
    name: "a_faire",
    description:
      "Ce qui attend une action : étapes de process en retard ou à venir, copies à corriger, messages non lus, pièces déposées par les élèves.",
    inputSchema: z.object({}),
    run: async () => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas accès à ces données.");
      const today = new Date();
      const [enRetard, aCorriger, pieces] = await Promise.all([
        prisma.stepInstance.findMany({
          where: { status: "pending", dueDate: { lt: today }, session: sessionScope(me) },
          orderBy: { dueDate: "asc" }, take: 20,
          select: {
            dueDate: true,
            stepTemplate: { select: { name: true, phase: true } },
            session: { select: { id: true, name: true } },
          },
        }),
        prisma.submission.findMany({
          where: { status: "submitted", session: sessionScope(me) },
          orderBy: { submittedAt: "asc" }, take: 20,
          select: {
            submittedAt: true,
            user: { select: { name: true } },
            exercise: { select: { title: true } },
            session: { select: { name: true } },
          },
        }),
        prisma.documentSlot.findMany({
          where: { archivedAt: null, documentId: { not: null }, session: sessionScope(me) },
          take: 20,
          select: { title: true, user: { select: { name: true } }, session: { select: { name: true } } },
        }),
      ]);
      return json({
        etapes_en_retard: enRetard.map((i) => ({
          etape: i.stepTemplate.name, session: i.session.name, sessionId: i.session.id,
          echeance: i.dueDate ? formatDate(i.dueDate) : null,
        })),
        copies_a_corriger: aCorriger.map((s) => ({
          eleve: s.user.name, exercice: s.exercise.title, session: s.session.name,
          rendu_le: formatDate(s.submittedAt),
        })),
        pieces_recues: pieces.map((s) => ({
          quoi: s.title, eleve: s.user?.name ?? null, session: s.session?.name ?? null,
        })),
      });
    },
  });

  return [chercherEleves, ficheEleve, listerSessions, resultatsSession, listerFormations, aFaire];
}
