import "server-only";

import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseConfig } from "@/lib/content/exercise-config";
import { EXERCISE_TYPES } from "@/lib/content/exercise-config";
import type { Prisma } from "@/generated/prisma/client";
import {
  has, sessionScope, ownedScope, json, refuse, propose, done, log, parseDay, type ToolContext,
} from "./context";

// Les outils qui ÉCRIVENT. Aucun ne s'exécute au premier appel : il propose,
// l'interface fait confirmer, et seul le second passage agit. Une phrase
// ambiguë ne doit pas pouvoir créer une session ou un compte.
export function writeTools(ctx: ToolContext) {
  const { me } = ctx;
  const ok = (name: string) => ctx.approved.includes(name);

  // ── Formations ───────────────────────────────────────────────────────────

  const creerFormation = betaZodTool({
    name: "creer_formation",
    description:
      "Crée une formation et sa première version (brouillon). Il faudra ensuite y ajouter des modules et des leçons, puis publier la version pour pouvoir ouvrir une session.",
    inputSchema: z.object({
      nom: z.string(),
      secteur: z.string().optional(),
      description: z.string().optional(),
    }),
    run: async ({ nom, secteur, description }) => {
      if (!has(me, "can_edit_formation")) return refuse("Vous n'avez pas le droit de créer une formation.");
      const summary = `Créer la formation « ${nom} »${secteur ? ` (${secteur})` : ""} et sa version 1 en brouillon`;
      if (!ok("creer_formation")) return propose(ctx, "creer_formation", summary);

      const formation = await prisma.formation.create({
        data: { name: nom, sector: secteur ?? null, description: description ?? null, ownerId: me.id },
      });
      const version = await prisma.formationVersion.create({
        data: { formationId: formation.id, versionNumber: 1, status: "draft", createdById: me.id, changelog: "Version initiale" },
      });
      await log(me, "creer_formation", "formation", formation.id);
      done(ctx, "creer_formation", summary);
      return json({ ok: true, formationId: formation.id, versionId: version.id, message: `Formation « ${nom} » créée, version 1 en brouillon.` });
    },
  });

  // Charge une version en brouillon dont l'utilisateur est maître.
  type Draft = Awaited<ReturnType<typeof prisma.formationVersion.findFirst>>;
  async function draftVersion(
    versionId: string,
  ): Promise<{ ok: false; error: string } | { ok: true; version: NonNullable<Draft> & { formation: { name: string }; formationId: string } }> {
    const version = await prisma.formationVersion.findFirst({
      where: { id: versionId, formation: { ...ownedScope(me), archivedAt: null } },
      include: { formation: { select: { name: true } } },
    });
    if (!version) return { ok: false, error: "Version introuvable dans votre périmètre." };
    if (version.status !== "draft") {
      return { ok: false, error: "Cette version est publiée : son contenu est gelé. Créez une nouvelle version." };
    }
    return { ok: true, version };
  }

  const ajouterModule = betaZodTool({
    name: "ajouter_module",
    description: "Ajoute un module à une version de formation en brouillon.",
    inputSchema: z.object({ versionId: z.string(), titre: z.string(), description: z.string().optional() }),
    run: async ({ versionId, titre, description }) => {
      if (!has(me, "can_edit_formation")) return refuse("Vous n'avez pas le droit de modifier une formation.");
      const loaded = await draftVersion(versionId);
      if (!loaded.ok) return refuse(loaded.error);

      const summary = `Ajouter le module « ${titre} » à ${loaded.version.formation.name}`;
      if (!ok("ajouter_module")) return propose(ctx, "ajouter_module", summary);

      const last = await prisma.module.findFirst({ where: { formationVersionId: versionId }, orderBy: { order: "desc" }, select: { order: true } });
      const mod = await prisma.module.create({
        data: { formationVersionId: versionId, order: (last?.order ?? 0) + 1, title: titre, description: description ?? null },
      });
      done(ctx, "ajouter_module", summary);
      return json({ ok: true, moduleId: mod.id, message: `Module « ${titre} » ajouté.` });
    },
  });

  const ajouterLecon = betaZodTool({
    name: "ajouter_lecon",
    description: "Ajoute une leçon à un module, avec sa durée pédagogique.",
    inputSchema: z.object({ moduleId: z.string(), titre: z.string(), dureeMinutes: z.number().int().min(0).optional() }),
    run: async ({ moduleId, titre, dureeMinutes }) => {
      if (!has(me, "can_edit_formation")) return refuse("Vous n'avez pas le droit de modifier une formation.");
      const parent = await prisma.module.findUnique({
        where: { id: moduleId },
        select: { id: true, title: true, formationVersionId: true },
      });
      if (!parent) return refuse("Module introuvable.");
      const loaded = await draftVersion(parent.formationVersionId);
      if (!loaded.ok) return refuse(loaded.error);

      const summary = `Ajouter la leçon « ${titre} » au module ${parent.title}`;
      if (!ok("ajouter_lecon")) return propose(ctx, "ajouter_lecon", summary);

      const last = await prisma.lesson.findFirst({ where: { moduleId }, orderBy: { order: "desc" }, select: { order: true } });
      const lesson = await prisma.lesson.create({
        data: { moduleId, order: (last?.order ?? 0) + 1, title: titre, durationMinutes: dureeMinutes ?? null },
      });
      done(ctx, "ajouter_lecon", summary);
      return json({ ok: true, leconId: lesson.id, message: `Leçon « ${titre} » ajoutée.` });
    },
  });

  const ajouterTexte = betaZodTool({
    name: "ajouter_texte",
    description:
      "Ajoute un bloc de texte au contenu d'une leçon. Le Markdown est accepté : titres, listes, tableaux, encadrés (> [!NOTE], > [!TIP], > [!WARNING]).",
    inputSchema: z.object({ leconId: z.string(), markdown: z.string() }),
    run: async ({ leconId, markdown }) => {
      if (!has(me, "can_edit_formation")) return refuse("Vous n'avez pas le droit de modifier une formation.");
      const lesson = await prisma.lesson.findUnique({
        where: { id: leconId },
        select: { id: true, title: true, module: { select: { formationVersionId: true } } },
      });
      if (!lesson) return refuse("Leçon introuvable.");
      const loaded = await draftVersion(lesson.module.formationVersionId);
      if (!loaded.ok) return refuse(loaded.error);

      const summary = `Ajouter du contenu à la leçon « ${lesson.title} »`;
      if (!ok("ajouter_texte")) return propose(ctx, "ajouter_texte", summary);

      const last = await prisma.contentBlock.findFirst({ where: { lessonId: leconId }, orderBy: { order: "desc" }, select: { order: true } });
      await prisma.contentBlock.create({
        data: { lessonId: leconId, order: (last?.order ?? 0) + 1, type: "text", payload: { markdown } },
      });
      done(ctx, "ajouter_texte", summary);
      return json({ ok: true, message: `Contenu ajouté à « ${lesson.title} ».` });
    },
  });

  const ajouterExercice = betaZodTool({
    name: "ajouter_exercice",
    description:
      "Ajoute un exercice à une leçon (leconId) ou en fin de module (moduleId) — l'un OU l'autre. Types : qcm, true_false, short_answer, long_text, file_upload.",
    inputSchema: z.object({
      leconId: z.string().optional(),
      moduleId: z.string().optional(),
      type: z.enum(["qcm", "true_false", "short_answer", "long_text", "file_upload"]),
      titre: z.string(),
      enonce: z.string(),
      bareme: z.number().int().min(0).optional(),
      propositions: z.array(z.object({ texte: z.string(), correcte: z.boolean() })).optional().describe("Pour un QCM : au moins deux, dont une correcte"),
      reponseVraie: z.boolean().optional().describe("Pour un vrai/faux"),
      reponsesAcceptees: z.array(z.string()).optional().describe("Pour une réponse courte"),
    }),
    run: async (input) => {
      if (!has(me, "can_edit_formation")) return refuse("Vous n'avez pas le droit de modifier une formation.");
      if (Boolean(input.leconId) === Boolean(input.moduleId)) {
        return refuse("Précisez soit leconId, soit moduleId — pas les deux, pas aucun.");
      }

      // On remonte à la version pour vérifier qu'elle est bien en brouillon.
      const versionId = input.leconId
        ? (await prisma.lesson.findUnique({ where: { id: input.leconId }, select: { module: { select: { formationVersionId: true } } } }))?.module.formationVersionId
        : (await prisma.module.findUnique({ where: { id: input.moduleId! }, select: { formationVersionId: true } }))?.formationVersionId;
      if (!versionId) return refuse("Leçon ou module introuvable.");
      const loaded = await draftVersion(versionId);
      if (!loaded.ok) return refuse(loaded.error);

      const summary = `Ajouter l'exercice « ${input.titre} » (${EXERCISE_TYPES[input.type].label})`;
      if (!ok("ajouter_exercice")) return propose(ctx, "ajouter_exercice", summary);

      // La configuration dépend du type ; on la valide avec le même schéma que
      // le formulaire, pour ne jamais écrire un exercice incorrigible.
      const raw =
        input.type === "qcm"
          ? { multiple: false, options: (input.propositions ?? []).map((o) => ({ text: o.texte, correct: o.correcte })) }
          : input.type === "true_false"
            ? { answer: input.reponseVraie ?? true }
            : input.type === "short_answer"
              ? { acceptedAnswers: input.reponsesAcceptees ?? [], caseSensitive: false, match: "exact" }
              : input.type === "long_text"
                ? { minWords: null, guidance: "" }
                : { guidance: "", maxFiles: 1 };
      const parsed = parseConfig(input.type, raw);
      if (!parsed.success) return refuse(`Configuration d'exercice invalide : ${parsed.error.issues[0].message}`);

      const where = input.leconId ? { lessonId: input.leconId } : { moduleId: input.moduleId };
      const last = await prisma.exercise.findFirst({ where, orderBy: { order: "desc" }, select: { order: true } });
      const exercise = await prisma.exercise.create({
        data: {
          lessonId: input.leconId ?? null,
          moduleId: input.moduleId ?? null,
          order: (last?.order ?? 0) + 1,
          type: input.type,
          title: input.titre,
          statement: input.enonce,
          correctionMode: EXERCISE_TYPES[input.type].correction,
          maxScore: input.bareme ?? null,
          config: parsed.data as Prisma.InputJsonValue,
        },
      });
      done(ctx, "ajouter_exercice", summary);
      return json({ ok: true, exerciceId: exercise.id, message: `Exercice « ${input.titre} » ajouté.` });
    },
  });

  const publierVersion = betaZodTool({
    name: "publier_version",
    description:
      "Publie une version de formation : son contenu est gelé et elle devient utilisable par des sessions. Irréversible.",
    inputSchema: z.object({ versionId: z.string() }),
    run: async ({ versionId }) => {
      if (!has(me, "can_edit_formation")) return refuse("Vous n'avez pas le droit de publier une version.");
      const loaded = await draftVersion(versionId);
      if (!loaded.ok) return refuse(loaded.error);

      const lessons = await prisma.lesson.count({ where: { module: { formationVersionId: versionId } } });
      if (lessons === 0) return refuse("Cette version n'a aucune leçon : ajoutez du contenu avant de publier.");

      const summary = `Publier la version de ${loaded.version.formation.name} (gel définitif du contenu)`;
      if (!ok("publier_version")) return propose(ctx, "publier_version", summary);

      await prisma.$transaction([
        // Une seule version active à la fois : l'ancienne est remplacée.
        prisma.formationVersion.updateMany({
          where: { formationId: loaded.version.formationId, status: "active" },
          data: { status: "archived" },
        }),
        prisma.formationVersion.update({
          where: { id: versionId },
          data: { status: "active", publishedAt: new Date() },
        }),
      ]);
      await log(me, "publier_version", "formation", loaded.version.formationId);
      done(ctx, "publier_version", summary);
      return json({ ok: true, message: `Version publiée : ${loaded.version.formation.name} est prête à recevoir des sessions.` });
    },
  });

  // ── Sessions ─────────────────────────────────────────────────────────────

  const creerSession = betaZodTool({
    name: "creer_session",
    description:
      "Crée une session sur une version PUBLIÉE. Utiliser lister_formations pour obtenir la versionId, ou publier_version au préalable.",
    inputSchema: z.object({
      versionId: z.string(),
      nom: z.string(),
      dateDebut: z.string().describe("AAAA-MM-JJ"),
      dateFin: z.string().describe("AAAA-MM-JJ"),
      heures: z.number().optional(),
      entrepriseId: z.string().optional().describe("Entreprise cliente qui finance"),
    }),
    run: async ({ versionId, nom, dateDebut, dateFin, heures, entrepriseId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de créer une session.");
      const version = await prisma.formationVersion.findFirst({
        where: { id: versionId, formation: { ...ownedScope(me), archivedAt: null } },
        select: { id: true, status: true, formation: { select: { name: true } } },
      });
      if (!version) return refuse("Version de formation introuvable dans votre périmètre.");
      if (version.status === "draft") return refuse("Cette version est un brouillon : publiez-la avant d'ouvrir une session.");

      const debut = parseDay(dateDebut);
      const fin = parseDay(dateFin);
      if (!debut || !fin) return refuse("Dates attendues au format AAAA-MM-JJ.");
      if (fin < debut) return refuse("La date de fin précède la date de début.");

      if (entrepriseId) {
        const company = await prisma.company.findFirst({ where: { id: entrepriseId, ...ownedScope(me) }, select: { id: true } });
        if (!company) return refuse("Entreprise introuvable dans votre périmètre.");
      }

      const summary = `Créer la session « ${nom} » sur ${version.formation.name}, du ${dateDebut} au ${dateFin}`;
      if (!ok("creer_session")) return propose(ctx, "creer_session", summary);

      const session = await prisma.session.create({
        data: {
          ownerId: me.id, trainerId: me.id, formationVersionId: version.id, companyId: entrepriseId ?? null,
          name: nom, startDate: debut, endDate: fin, durationHours: heures ?? null,
          status: "planned", processSnapshot: {},
        },
      });
      await log(me, "creer_session", "session", session.id);
      done(ctx, "creer_session", summary);
      return json({ ok: true, sessionId: session.id, message: `Session « ${nom} » créée.` });
    },
  });

  // Charge une session dont l'utilisateur est maître.
  async function ownedSession(sessionId: string) {
    return prisma.session.findFirst({
      where: { id: sessionId, ...sessionScope(me) },
      select: { id: true, name: true, status: true },
    });
  }

  const modifierSession = betaZodTool({
    name: "modifier_session",
    description: "Modifie le nom, les dates ou la durée d'une session.",
    inputSchema: z.object({
      sessionId: z.string(),
      nom: z.string().optional(),
      dateDebut: z.string().optional().describe("AAAA-MM-JJ"),
      dateFin: z.string().optional().describe("AAAA-MM-JJ"),
      heures: z.number().optional(),
    }),
    run: async ({ sessionId, nom, dateDebut, dateFin, heures }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de modifier une session.");
      const session = await ownedSession(sessionId);
      if (!session) return refuse("Session introuvable dans votre périmètre.");
      const debut = dateDebut ? parseDay(dateDebut) : undefined;
      const fin = dateFin ? parseDay(dateFin) : undefined;
      if (dateDebut && !debut) return refuse("Date de début invalide (AAAA-MM-JJ attendu).");
      if (dateFin && !fin) return refuse("Date de fin invalide (AAAA-MM-JJ attendu).");

      const changes = [nom ? `nom « ${nom} »` : null, dateDebut ? `début ${dateDebut}` : null, dateFin ? `fin ${dateFin}` : null, heures ? `${heures} h` : null].filter(Boolean);
      if (changes.length === 0) return refuse("Rien à modifier.");

      const summary = `Modifier « ${session.name} » : ${changes.join(", ")}`;
      if (!ok("modifier_session")) return propose(ctx, "modifier_session", summary);

      await prisma.session.update({
        where: { id: sessionId },
        data: {
          ...(nom ? { name: nom } : {}),
          ...(debut ? { startDate: debut } : {}),
          ...(fin ? { endDate: fin } : {}),
          ...(heures !== undefined ? { durationHours: heures } : {}),
        },
      });
      await log(me, "modifier_session", "session", sessionId);
      done(ctx, "modifier_session", summary);
      return json({ ok: true, message: `Session « ${session.name} » mise à jour.` });
    },
  });

  const annulerSession = betaZodTool({
    name: "annuler_session",
    description: "Annule une session. Elle reste consultable : rien n'est supprimé.",
    inputSchema: z.object({ sessionId: z.string() }),
    run: async ({ sessionId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit d'annuler une session.");
      const session = await ownedSession(sessionId);
      if (!session) return refuse("Session introuvable dans votre périmètre.");
      if (session.status === "cancelled") return json({ ok: true, message: "Cette session est déjà annulée." });

      const summary = `Annuler la session « ${session.name} »`;
      if (!ok("annuler_session")) return propose(ctx, "annuler_session", summary);

      await prisma.session.update({ where: { id: sessionId }, data: { status: "cancelled" } });
      await log(me, "annuler_session", "session", sessionId);
      done(ctx, "annuler_session", summary);
      return json({ ok: true, message: `Session « ${session.name} » annulée.` });
    },
  });

  const inscrireEleve = betaZodTool({
    name: "inscrire_eleve",
    description: "Inscrit un élève EXISTANT à une session.",
    inputSchema: z.object({ eleveId: z.string(), sessionId: z.string() }),
    run: async ({ eleveId, sessionId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit d'inscrire un élève.");
      const session = await ownedSession(sessionId);
      if (!session) return refuse("Session introuvable dans votre périmètre.");
      if (session.status === "cancelled") return refuse("Session annulée : inscription impossible.");
      const student = await prisma.user.findUnique({ where: { id: eleveId, archivedAt: null }, select: { id: true, name: true } });
      if (!student) return refuse("Élève introuvable.");

      const already = await prisma.enrollment.count({ where: { sessionId, userId: eleveId } });
      if (already) return json({ ok: true, message: `${student.name} est déjà inscrit à « ${session.name} ».` });

      const summary = `Inscrire ${student.name} à « ${session.name} »`;
      if (!ok("inscrire_eleve")) return propose(ctx, "inscrire_eleve", summary);

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

  // ── Personnes ────────────────────────────────────────────────────────────

  // Crée le compte d'authentification et le profil, avec le mot de passe posé
  // par l'utilisateur. Aucun mail ne part : c'est lui qui transmet.
  async function createAccount(
    nom: string, email: string, motDePasse: string, roleKey: string, companyId?: string,
  ): Promise<{ ok: false; error: string } | { ok: true; userId: string; email: string }> {
    const normalized = email.trim().toLowerCase();
    const exists = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } });
    if (exists) return { ok: false, error: "Un compte existe déjà avec cette adresse." };

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: normalized, password: motDePasse, email_confirm: true, user_metadata: { name: nom },
    });
    if (error || !data.user) return { ok: false, error: "Création impossible avec cette adresse." };

    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    await prisma.$transaction([
      prisma.user.upsert({
        where: { id: data.user.id },
        create: { id: data.user.id, email: normalized, name: nom, companyId: companyId ?? null },
        update: { name: nom, companyId: companyId ?? null },
      }),
      prisma.userRole.upsert({
        where: { userId_roleId: { userId: data.user.id, roleId: role.id } },
        create: { userId: data.user.id, roleId: role.id },
        update: {},
      }),
    ]);
    return { ok: true, userId: data.user.id, email: normalized };
  }

  const creerEleve = betaZodTool({
    name: "creer_eleve",
    description:
      "Crée un compte élève avec son mot de passe, et l'inscrit à une session si sessionId est fourni. Aucun mail n'est envoyé.",
    inputSchema: z.object({
      nom: z.string(),
      email: z.string(),
      motDePasse: z.string().min(8),
      sessionId: z.string().optional(),
      entrepriseId: z.string().optional(),
    }),
    run: async ({ nom, email, motDePasse, sessionId, entrepriseId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de créer un compte.");
      let session: { id: string; name: string; status: string } | null = null;
      if (sessionId) {
        session = await ownedSession(sessionId);
        if (!session) return refuse("Session introuvable dans votre périmètre.");
      }
      if (entrepriseId) {
        const company = await prisma.company.findFirst({ where: { id: entrepriseId, ...ownedScope(me) }, select: { id: true } });
        if (!company) return refuse("Entreprise introuvable dans votre périmètre.");
      }

      const summary = session
        ? `Créer le compte de ${nom} (${email}) et l'inscrire à « ${session.name} »`
        : `Créer le compte de ${nom} (${email})`;
      if (!ok("creer_eleve")) return propose(ctx, "creer_eleve", summary);

      const created = await createAccount(nom, email, motDePasse, "eleve", entrepriseId);
      if (!created.ok) return refuse(created.error);

      if (session) {
        await prisma.enrollment.create({ data: { sessionId: session.id, userId: created.userId } });
        await prisma.conversation.create({ data: { sessionId: session.id, userId: created.userId } });
      }
      await log(me, "creer_eleve", "user", created.userId);
      done(ctx, "creer_eleve", summary);
      return json({
        ok: true, eleveId: created.userId,
        message: `Compte créé. Identifiants à transmettre : ${created.email} / ${motDePasse}`,
      });
    },
  });

  const creerFormateur = betaZodTool({
    name: "creer_formateur",
    description: "Crée un compte formateur avec son mot de passe. Il aura son propre périmètre.",
    inputSchema: z.object({ nom: z.string(), email: z.string(), motDePasse: z.string().min(8) }),
    run: async ({ nom, email, motDePasse }) => {
      if (!has(me, "can_manage_users")) return refuse("Vous n'avez pas le droit de créer un compte formateur.");
      const summary = `Créer le compte formateur de ${nom} (${email})`;
      if (!ok("creer_formateur")) return propose(ctx, "creer_formateur", summary);

      const created = await createAccount(nom, email, motDePasse, "formateur");
      if (!created.ok) return refuse(created.error);
      await log(me, "creer_formateur", "user", created.userId);
      done(ctx, "creer_formateur", summary);
      return json({ ok: true, userId: created.userId, message: `Compte formateur créé. Identifiants : ${created.email} / ${motDePasse}` });
    },
  });

  const creerEntreprise = betaZodTool({
    name: "creer_entreprise",
    description: "Crée une entreprise cliente avec sa fiche complète.",
    inputSchema: z.object({
      nom: z.string(),
      siret: z.string().optional().describe("14 chiffres"),
      secteur: z.string().optional(),
      contactNom: z.string().optional(),
      contactEmail: z.string().optional(),
      contactTelephone: z.string().optional(),
      adresse: z.string().optional(),
    }),
    run: async (input) => {
      if (!has(me, "can_manage_companies")) return refuse("Vous n'avez pas le droit de créer une entreprise.");
      if (input.siret && !/^\d{14}$/.test(input.siret)) return refuse("Le SIRET comporte 14 chiffres.");
      if (input.siret) {
        const exists = await prisma.company.findUnique({ where: { siret: input.siret }, select: { id: true } });
        if (exists) return refuse("Ce SIRET existe déjà.");
      }

      const summary = `Créer l'entreprise « ${input.nom} »`;
      if (!ok("creer_entreprise")) return propose(ctx, "creer_entreprise", summary);

      const company = await prisma.company.create({
        data: {
          name: input.nom, siret: input.siret ?? null, sector: input.secteur ?? null,
          contactName: input.contactNom ?? null, contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactTelephone ?? null, address: input.adresse ?? null,
          ownerId: me.id,
        },
      });
      await log(me, "creer_entreprise", "company", company.id);
      done(ctx, "creer_entreprise", summary);
      return json({ ok: true, entrepriseId: company.id, message: `Entreprise « ${input.nom} » créée.` });
    },
  });

  const creerContactEntreprise = betaZodTool({
    name: "creer_contact_entreprise",
    description:
      "Ouvre l'accès du contact d'une entreprise à son espace. Il verra ses salariés en formation et le dossier de sa société, jamais le travail de ses salariés.",
    inputSchema: z.object({ entrepriseId: z.string(), nom: z.string(), email: z.string(), motDePasse: z.string().min(8) }),
    run: async ({ entrepriseId, nom, email, motDePasse }) => {
      if (!has(me, "can_manage_companies")) return refuse("Vous n'avez pas le droit de gérer cette entreprise.");
      const company = await prisma.company.findFirst({ where: { id: entrepriseId, ...ownedScope(me), archivedAt: null }, select: { id: true, name: true } });
      if (!company) return refuse("Entreprise introuvable dans votre périmètre.");

      const summary = `Ouvrir l'accès de ${nom} (${email}) à l'espace de ${company.name}`;
      if (!ok("creer_contact_entreprise")) return propose(ctx, "creer_contact_entreprise", summary);

      const created = await createAccount(nom, email, motDePasse, "entreprise", company.id);
      if (!created.ok) return refuse(created.error);
      await prisma.company.update({ where: { id: company.id }, data: { contactName: nom, contactEmail: created.email } });
      await log(me, "creer_contact_entreprise", "user", created.userId);
      done(ctx, "creer_contact_entreprise", summary);
      return json({ ok: true, userId: created.userId, message: `Accès créé. Identifiants : ${created.email} / ${motDePasse}` });
    },
  });

  const changerMotDePasse = betaZodTool({
    name: "changer_mot_de_passe",
    description: "Redéfinit le mot de passe d'un compte de son périmètre. L'ancien cesse aussitôt de fonctionner.",
    inputSchema: z.object({ userId: z.string(), motDePasse: z.string().min(8) }),
    run: async ({ userId, motDePasse }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de changer un mot de passe.");
      const target = await prisma.user.findFirst({
        where: {
          id: userId, archivedAt: null,
          ...(has(me, "can_manage_users") || has(me, "can_view_all_dossiers")
            ? {}
            : { OR: [{ enrollments: { some: { session: sessionScope(me) } } }, { company: ownedScope(me) }] }),
        },
        select: { id: true, name: true, email: true },
      });
      if (!target) return refuse("Compte introuvable dans votre périmètre.");

      const summary = `Changer le mot de passe de ${target.name} (${target.email})`;
      if (!ok("changer_mot_de_passe")) return propose(ctx, "changer_mot_de_passe", summary);

      const admin = createAdminClient();
      const { error } = await admin.auth.admin.updateUserById(target.id, { password: motDePasse });
      if (error) return refuse("Changement impossible.");
      await log(me, "changer_mot_de_passe", "user", target.id);
      done(ctx, "changer_mot_de_passe", summary);
      return json({ ok: true, message: `Nouveau mot de passe pour ${target.email} : ${motDePasse}` });
    },
  });

  // ── Dossier et échanges ──────────────────────────────────────────────────

  const demanderPiece = betaZodTool({
    name: "demander_piece",
    description:
      "Ouvre un emplacement dans l'espace commun : une pièce que l'élève doit fournir, ou une pièce à signer (vous y déposerez ensuite le document).",
    inputSchema: z.object({
      eleveId: z.string(),
      sessionId: z.string(),
      titre: z.string(),
      nature: z.enum(["a_fournir", "a_signer"]).default("a_fournir"),
      precisions: z.string().optional(),
    }),
    run: async ({ eleveId, sessionId, titre, nature, precisions }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de faire une demande.");
      const session = await ownedSession(sessionId);
      if (!session) return refuse("Session introuvable dans votre périmètre.");
      const enrolled = await prisma.enrollment.count({ where: { sessionId, userId: eleveId } });
      if (!enrolled) return refuse("Cet élève n'est pas inscrit à cette session.");
      const student = await prisma.user.findUnique({ where: { id: eleveId }, select: { name: true } });

      const label = nature === "a_signer" ? "à signer" : "à fournir";
      const summary = `Demander « ${titre} » (${label}) à ${student?.name ?? "cet élève"} sur « ${session.name} »`;
      if (!ok("demander_piece")) return propose(ctx, "demander_piece", summary);

      const last = await prisma.documentSlot.findFirst({ where: { userId: eleveId, sessionId }, orderBy: { order: "desc" }, select: { order: true } });
      const slot = await prisma.documentSlot.create({
        data: {
          kind: nature === "a_signer" ? "to_sign" : "to_provide",
          title: titre, instructions: precisions ?? null,
          order: (last?.order ?? 0) + 1,
          userId: eleveId, sessionId, createdById: me.id,
        },
      });
      await log(me, "demander_piece", "user", eleveId);
      done(ctx, "demander_piece", summary);
      return json({
        ok: true, emplacementId: slot.id,
        message: nature === "a_signer"
          ? `Emplacement « ${titre} » ouvert. Déposez-y le document depuis la fiche de l'élève : la demande de signature partira aussitôt.`
          : `Demande « ${titre} » ouverte.`,
      });
    },
  });

  const envoyerMessage = betaZodTool({
    name: "envoyer_message",
    description: "Écrit un message à un élève dans le fil de sa session.",
    inputSchema: z.object({ eleveId: z.string(), sessionId: z.string(), texte: z.string() }),
    run: async ({ eleveId, sessionId, texte }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit d'écrire à cet élève.");
      const session = await ownedSession(sessionId);
      if (!session) return refuse("Session introuvable dans votre périmètre.");
      if (session.status === "cancelled") return refuse("Session annulée : la conversation est close.");
      const student = await prisma.user.findUnique({ where: { id: eleveId }, select: { name: true } });
      if (!student) return refuse("Élève introuvable.");

      const summary = `Écrire à ${student.name} : « ${texte.slice(0, 60)}${texte.length > 60 ? "…" : ""} »`;
      if (!ok("envoyer_message")) return propose(ctx, "envoyer_message", summary);

      const conversation = await prisma.conversation.upsert({
        where: { sessionId_userId: { sessionId, userId: eleveId } },
        create: { sessionId, userId: eleveId },
        update: {},
      });
      await prisma.message.create({
        data: { conversationId: conversation.id, senderId: me.id, body: texte, autoGenerated: false },
      });
      await log(me, "envoyer_message", "user", eleveId);
      done(ctx, "envoyer_message", summary);
      return json({ ok: true, message: `Message envoyé à ${student.name}.` });
    },
  });

  const noterCopie = betaZodTool({
    name: "noter_copie",
    description: "Note une copie en attente et écrit le retour à l'élève.",
    inputSchema: z.object({ copieId: z.string(), note: z.number(), retour: z.string().optional() }),
    run: async ({ copieId, note, retour }) => {
      if (!has(me, "can_correct_exercises")) return refuse("Vous n'avez pas le droit de corriger.");
      const submission = await prisma.submission.findFirst({
        where: { id: copieId, session: sessionScope(me) },
        select: {
          id: true, status: true,
          user: { select: { name: true } },
          exercise: { select: { title: true, maxScore: true } },
        },
      });
      if (!submission) return refuse("Copie introuvable dans votre périmètre.");
      const max = submission.exercise.maxScore ?? 0;
      if (note < 0 || (max > 0 && note > max)) return refuse(`Note hors barème (0 à ${max}).`);

      const summary = `Noter ${submission.user.name} sur « ${submission.exercise.title} » : ${note}/${max}`;
      if (!ok("noter_copie")) return propose(ctx, "noter_copie", summary);

      await prisma.submission.update({
        where: { id: copieId },
        data: { manualScore: note, feedback: retour ?? null, status: "graded", gradedAt: new Date(), gradedById: me.id },
      });
      await log(me, "noter_copie", "submission", copieId);
      done(ctx, "noter_copie", summary);
      return json({ ok: true, message: `Copie notée ${note}/${max}.` });
    },
  });

  return [
    creerFormation, ajouterModule, ajouterLecon, ajouterTexte, ajouterExercice, publierVersion,
    creerSession, modifierSession, annulerSession, inscrireEleve,
    creerEleve, creerFormateur, creerEntreprise, creerContactEntreprise, changerMotDePasse,
    demanderPiece, envoyerMessage, noterCopie,
  ];
}

// Les noms des outils qui écrivent : l'interface s'en sert pour savoir quoi
// faire confirmer, la route pour valider ce que le client lui renvoie.
export const WRITE_TOOLS = [
  "creer_formation", "ajouter_module", "ajouter_lecon", "ajouter_texte", "ajouter_exercice", "publier_version",
  "creer_session", "modifier_session", "annuler_session", "inscrire_eleve",
  "creer_eleve", "creer_formateur", "creer_entreprise", "creer_contact_entreprise", "changer_mot_de_passe",
  "demander_piece", "envoyer_message", "noter_copie",
];
