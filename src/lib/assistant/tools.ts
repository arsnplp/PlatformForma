import "server-only";

import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { prisma } from "@/lib/prisma";
import type { CurrentUser } from "@/lib/auth/session";
import { canSupervise } from "@/lib/auth/ownership";
import { getSessionResults, formatSeconds } from "@/lib/queries/results";
import { listStudentSlots } from "@/lib/queries/slots";
import { formatDate } from "@/lib/format";

// ═══════════════════════════════════════════════════════════════════════════
// LES OUTILS DE L'ASSISTANT
//
// Règle unique et non négociable : l'assistant agit AVEC les droits de la
// personne connectée, jamais au-dessus. Chaque outil refait ici les mêmes
// vérifications que les écrans — permission, puis périmètre du propriétaire.
// Aucun outil n'utilise la clé de service.
//
// Les outils d'ÉCRITURE ne s'exécutent que si leur nom figure dans `approved`,
// c'est-à-dire après un clic de confirmation dans l'interface. Sinon ils
// renvoient une proposition, que le modèle présente à l'utilisateur.
// ═══════════════════════════════════════════════════════════════════════════

export type ToolContext = {
  me: CurrentUser;
  /// Noms des outils d'écriture autorisés pour ce tour, après confirmation.
  approved: string[];
  /// Rempli au fil de l'exécution : ce que l'assistant a fait ou veut faire.
  trace: { tool: string; summary: string; done: boolean }[];
};

const has = (me: CurrentUser, key: string) => me.permissions.has(key);

// Périmètre des sessions : les siennes, ou toutes pour un superviseur.
function sessionScope(me: CurrentUser) {
  return canSupervise(me) ? {} : { OR: [{ ownerId: me.id }, { trainerId: me.id }] };
}

// Le SDK attend une chaine : on serialise, le modele lit du JSON tres bien.
const json = (value: unknown) => JSON.stringify(value);

function refuse(reason: string) {
  return json({ erreur: reason });
}

// Demande de confirmation : l'action n'est pas jouée, elle est proposée.
function propose(ctx: ToolContext, tool: string, summary: string) {
  ctx.trace.push({ tool, summary, done: false });
  return json({
    confirmation_requise: true,
    resume: summary,
    consigne: "Explique à l'utilisateur ce que tu t'apprêtes à faire et demande-lui de confirmer. N'invente pas que l'action est faite.",
  });
}

function done(ctx: ToolContext, tool: string, summary: string) {
  ctx.trace.push({ tool, summary, done: true });
}

// Trace d'audit : une action de l'assistant se distingue d'une action manuelle.
async function log(me: CurrentUser, action: string, targetType: string, targetId: string) {
  await prisma.accessLog.create({
    data: { userId: me.id, action: `assistant_${action}`, targetType, targetId },
  });
}

export function buildTools(ctx: ToolContext) {
  const { me } = ctx;

  // ── Lecture ──────────────────────────────────────────────────────────────

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
      const scope = canSupervise(me) ? {} : { ownerId: me.id };
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

  // ── Écriture ─────────────────────────────────────────────────────────────

  const creerSession = betaZodTool({
    name: "creer_session",
    description:
      "Crée une session sur une version de formation. Demande confirmation avant d'agir. Utiliser lister_formations d'abord pour obtenir la versionId.",
    inputSchema: z.object({
      versionId: z.string().describe("Version de formation (obtenue par lister_formations)"),
      nom: z.string().describe("Nom de la session, ex. « Session octobre 2026 »"),
      dateDebut: z.string().describe("Date de début au format AAAA-MM-JJ"),
      dateFin: z.string().describe("Date de fin au format AAAA-MM-JJ"),
      heures: z.number().optional().describe("Durée conventionnelle en heures"),
    }),
    run: async ({ versionId, nom, dateDebut, dateFin, heures }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de créer une session.");
      const version = await prisma.formationVersion.findUnique({
        where: { id: versionId },
        select: { id: true, status: true, formation: { select: { name: true, ownerId: true, archivedAt: true } } },
      });
      if (!version) return refuse("Version de formation introuvable.");
      if (!canSupervise(me) && version.formation.ownerId !== me.id) return refuse("Cette formation ne vous appartient pas.");
      if (version.formation.archivedAt) return refuse("Formation archivée.");
      if (version.status === "draft") return refuse("Cette version est un brouillon : publiez-la avant d'ouvrir une session.");

      const summary = `Créer la session « ${nom} » sur ${version.formation.name}, du ${dateDebut} au ${dateFin}`;
      if (!ctx.approved.includes("creer_session")) return propose(ctx, "creer_session", summary);

      const session = await prisma.session.create({
        data: {
          ownerId: me.id, trainerId: me.id, formationVersionId: version.id,
          name: nom,
          startDate: new Date(dateDebut), endDate: new Date(dateFin),
          durationHours: heures ?? null,
          status: "planned", processSnapshot: {},
        },
      });
      await log(me, "creer_session", "session", session.id);
      done(ctx, "creer_session", summary);
      return json({ ok: true, sessionId: session.id, message: `Session « ${nom} » créée.` });
    },
  });

  const inscrireEleve = betaZodTool({
    name: "inscrire_eleve",
    description: "Inscrit un élève EXISTANT à une session. Demande confirmation avant d'agir.",
    inputSchema: z.object({
      eleveId: z.string(),
      sessionId: z.string(),
    }),
    run: async ({ eleveId, sessionId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit d'inscrire un élève.");
      const [session, student] = await Promise.all([
        prisma.session.findFirst({ where: { id: sessionId, ...sessionScope(me) }, select: { id: true, name: true, status: true } }),
        prisma.user.findUnique({ where: { id: eleveId, archivedAt: null }, select: { id: true, name: true } }),
      ]);
      if (!session) return refuse("Session introuvable dans votre périmètre.");
      if (session.status === "cancelled") return refuse("Session annulée : inscription impossible.");
      if (!student) return refuse("Élève introuvable.");

      const already = await prisma.enrollment.count({ where: { sessionId, userId: eleveId } });
      if (already) return json({ ok: true, message: `${student.name} est déjà inscrit à « ${session.name} ».` });

      const summary = `Inscrire ${student.name} à « ${session.name} »`;
      if (!ctx.approved.includes("inscrire_eleve")) return propose(ctx, "inscrire_eleve", summary);

      await prisma.enrollment.create({ data: { sessionId, userId: eleveId } });
      await prisma.conversation.upsert({
        where: { sessionId_userId: { sessionId, userId: eleveId } },
        create: { sessionId, userId: eleveId },
        update: {},
      });
      await log(me, "inscrire_eleve", "user", eleveId);
      done(ctx, "inscrire_eleve", summary);
      return json({ ok: true, message: `${student.name} est inscrit à « ${session.name} ».` });
    },
  });

  const creerEleve = betaZodTool({
    name: "creer_eleve",
    description:
      "Crée un compte élève avec son mot de passe. Aucun mail n'est envoyé : l'utilisateur transmettra les identifiants. Demande confirmation avant d'agir.",
    inputSchema: z.object({
      nom: z.string(),
      email: z.string().describe("Adresse email, servira d'identifiant"),
      motDePasse: z.string().min(8).describe("Huit caractères au minimum"),
      sessionId: z.string().optional().describe("Pour l'inscrire à une session dans la foulée"),
    }),
    run: async ({ nom, email, motDePasse, sessionId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de créer un compte.");
      const normalized = email.trim().toLowerCase();
      const exists = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
      if (exists) return refuse("Un compte existe déjà avec cette adresse.");

      let session: { id: string; name: string } | null = null;
      if (sessionId) {
        session = await prisma.session.findFirst({ where: { id: sessionId, ...sessionScope(me) }, select: { id: true, name: true } });
        if (!session) return refuse("Session introuvable dans votre périmètre.");
      }

      const summary = session
        ? `Créer le compte de ${nom} (${normalized}) et l'inscrire à « ${session.name} »`
        : `Créer le compte de ${nom} (${normalized})`;
      if (!ctx.approved.includes("creer_eleve")) return propose(ctx, "creer_eleve", summary);

      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data, error } = await admin.auth.admin.createUser({
        email: normalized, password: motDePasse, email_confirm: true, user_metadata: { name: nom },
      });
      if (error || !data.user) return refuse("Création impossible avec cette adresse.");

      const role = await prisma.role.findUniqueOrThrow({ where: { key: "eleve" } });
      await prisma.$transaction([
        prisma.user.upsert({
          where: { id: data.user.id },
          create: { id: data.user.id, email: normalized, name: nom },
          update: { name: nom },
        }),
        prisma.userRole.upsert({
          where: { userId_roleId: { userId: data.user.id, roleId: role.id } },
          create: { userId: data.user.id, roleId: role.id },
          update: {},
        }),
      ]);
      if (session) {
        await prisma.enrollment.create({ data: { sessionId: session.id, userId: data.user.id } });
        await prisma.conversation.create({ data: { sessionId: session.id, userId: data.user.id } });
      }
      await log(me, "creer_eleve", "user", data.user.id);
      done(ctx, "creer_eleve", summary);
      return json({
        ok: true, eleveId: data.user.id,
        message: `Compte créé pour ${nom}. Identifiants à transmettre : ${normalized} / ${motDePasse}`,
      });
    },
  });

  const demanderDocument = betaZodTool({
    name: "demander_document",
    description:
      "Ouvre un emplacement dans l'espace commun d'un élève : une pièce à fournir. Demande confirmation avant d'agir.",
    inputSchema: z.object({
      eleveId: z.string(),
      sessionId: z.string(),
      titre: z.string().describe("Nom de la pièce attendue, ex. « Carte d'identité »"),
      precisions: z.string().optional(),
    }),
    run: async ({ eleveId, sessionId, titre, precisions }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de faire une demande.");
      const session = await prisma.session.findFirst({ where: { id: sessionId, ...sessionScope(me) }, select: { id: true, name: true } });
      if (!session) return refuse("Session introuvable dans votre périmètre.");
      const enrolled = await prisma.enrollment.count({ where: { sessionId, userId: eleveId } });
      if (!enrolled) return refuse("Cet élève n'est pas inscrit à cette session.");
      const student = await prisma.user.findUnique({ where: { id: eleveId }, select: { name: true } });

      const summary = `Demander « ${titre} » à ${student?.name ?? "cet élève"} sur « ${session.name} »`;
      if (!ctx.approved.includes("demander_document")) return propose(ctx, "demander_document", summary);

      const last = await prisma.documentSlot.findFirst({
        where: { userId: eleveId, sessionId }, orderBy: { order: "desc" }, select: { order: true },
      });
      const slot = await prisma.documentSlot.create({
        data: {
          kind: "to_provide", title: titre, instructions: precisions ?? null,
          order: (last?.order ?? 0) + 1,
          userId: eleveId, sessionId, createdById: me.id,
        },
      });
      await log(me, "demander_document", "user", eleveId);
      done(ctx, "demander_document", summary);
      return json({ ok: true, slotId: slot.id, message: `Demande « ${titre} » ouverte.` });
    },
  });

  return [
    chercherEleves, ficheEleve, listerSessions, resultatsSession, listerFormations, aFaire,
    creerSession, inscrireEleve, creerEleve, demanderDocument,
  ];
}

// Les outils qui écrivent : l'interface s'en sert pour savoir quoi faire
// confirmer, et le prompt système pour rappeler la règle.
export const WRITE_TOOLS = ["creer_session", "inscrire_eleve", "creer_eleve", "demander_document"];
