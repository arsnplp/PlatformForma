import "server-only";

import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { prisma } from "@/lib/prisma";
import { planSeance } from "@/lib/actions/seances";
import { openSeance, remindSeance, closeSeance } from "@/lib/actions/attendance";
import { TRIGGER_ANCHOR, ACTION_TYPE, phaseLabel } from "@/lib/labels";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  has, sessionScope, ownedScope, json, refuse, propose, done, log, type ToolContext,
} from "./context";

// Process, mails, séances et émargements. Ces outils touchent au moteur de la
// plateforme : ils appliquent les mêmes règles que les écrans, et refusent
// explicitement ce que la spec interdit plutôt que de le contourner.
export function processTools(ctx: ToolContext) {
  const { me } = ctx;
  const ok = (name: string) => ctx.approved.includes(name);

  // Un process appartient à une VERSION, et ne se modifie qu'en brouillon :
  // les sessions déjà lancées ont figé le leur (piège n°6 de la spec).
  async function draftVersion(versionId: string) {
    const version = await prisma.formationVersion.findFirst({
      where: { id: versionId, formation: { ...ownedScope(me), archivedAt: null } },
      include: { formation: { select: { name: true } } },
    });
    if (!version) return { ok: false as const, error: "Version introuvable dans votre périmètre." };
    if (version.status !== "draft") {
      return {
        ok: false as const,
        error: "Cette version est publiée : son process est gelé. Les sessions en cours gardent de toute façon le process figé à leur démarrage.",
      };
    }
    return { ok: true as const, version };
  }

  // ── Process ──────────────────────────────────────────────────────────────

  const listerProcess = betaZodTool({
    name: "lister_process",
    description: "Le process d'une version de formation : ses étapes, par phase, avec leur déclencheur et leur assigné.",
    inputSchema: z.object({ versionId: z.string() }),
    run: async ({ versionId }) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas accès aux process.");
      const template = await prisma.processTemplate.findFirst({
        where: { formationVersionId: versionId, archivedAt: null, formationVersion: { formation: ownedScope(me) } },
        include: {
          steps: {
            orderBy: { order: "asc" },
            include: { assigneeUser: { select: { name: true } }, assigneeRole: { select: { label: true } } },
          },
        },
      });
      if (!template) return json({ process: null, message: "Aucun process sur cette version." });
      return json({
        processId: template.id, nom: template.name,
        etapes: template.steps.map((s) => ({
          id: s.id, phase: `P${s.phase} ${phaseLabel(s.phase)}`, nom: s.name,
          declencheur: s.triggerType === "manual"
            ? "manuel"
            : s.triggerType === "time_offset"
              ? `${s.triggerOffsetDays ?? 0} jours / ${s.triggerAnchor ? TRIGGER_ANCHOR[s.triggerAnchor] : "?"}`
              : `événement · ${s.triggerAnchor ? TRIGGER_ANCHOR[s.triggerAnchor] : "?"}`,
          action: ACTION_TYPE[s.actionType].label,
          assigne: s.assigneeUser?.name ?? s.assigneeRole?.label ?? null,
        })),
      });
    },
  });

  const ajouterEtape = betaZodTool({
    name: "ajouter_etape",
    description:
      "Ajoute une étape au process d'une version en brouillon. Le process est créé s'il n'existe pas. Déclencheur : manuel, ou un décalage en jours par rapport à une ancre (début/fin de session, signature, inscription, accord OPCO).",
    inputSchema: z.object({
      versionId: z.string(),
      nom: z.string(),
      phase: z.number().int().min(0).max(7),
      description: z.string().optional(),
      declencheur: z.enum(["manual", "time_offset", "event"]).default("manual"),
      ancre: z.enum(["start_date", "end_date", "signature", "enrollment", "opco_agreement"]).optional(),
      decalageJours: z.number().int().min(-365).max(365).optional().describe("Négatif pour « avant », ex. -7 pour J-7"),
    }),
    run: async ({ versionId, nom, phase, description, declencheur, ancre, decalageJours }) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas le droit de modifier un process.");
      const loaded = await draftVersion(versionId);
      if (!loaded.ok) return refuse(loaded.error);
      if (declencheur !== "manual" && !ancre) return refuse("Un déclencheur automatique demande une ancre (début de session, signature…).");

      const summary = `Ajouter l'étape « ${nom} » en P${phase} ${phaseLabel(phase)} de ${loaded.version.formation.name}`;
      if (!ok("ajouter_etape")) return propose(ctx, "ajouter_etape", summary);

      const template = await prisma.processTemplate.findFirst({
        where: { formationVersionId: versionId, archivedAt: null },
        select: { id: true },
      }) ?? await prisma.processTemplate.create({
        data: { formationVersionId: versionId, name: "Process de la formation" },
      });

      // Insérée en fin de sa phase, les suivantes décalées : l'ordre reste
      // cohérent avec la lecture par phases.
      //
      // La lecture des rangs se fait DANS la transaction : l'assistant appelle
      // volontiers cet outil plusieurs fois en parallèle, et deux insertions
      // qui auraient lu le même rang se heurteraient à l'unicité
      // (processTemplateId, order). On réessaie une fois en cas de collision.
      const insert = () =>
        prisma.$transaction(async (tx) => {
          const steps = await tx.stepTemplate.findMany({ where: { processTemplateId: template.id }, orderBy: { order: "asc" } });
          const before = steps.filter((s) => s.phase <= phase);
          const insertAt = before.length ? before[before.length - 1].order + 1 : 1;
          for (const s of steps.filter((x) => x.order >= insertAt).sort((a, b) => b.order - a.order)) {
            await tx.stepTemplate.update({ where: { id: s.id }, data: { order: s.order + 1 } });
          }
          return tx.stepTemplate.create({
            data: {
              processTemplateId: template.id, order: insertAt, phase, name: nom,
              description: description ?? null,
              triggerType: declencheur,
              triggerAnchor: declencheur === "manual" ? null : ancre,
              triggerOffsetDays: declencheur === "time_offset" ? (decalageJours ?? 0) : null,
              actionType: "checklist_only",
            },
          });
        });

      let step;
      try {
        step = await insert();
      } catch {
        step = await insert();
      }
      await log(me, "ajouter_etape", "formation", loaded.version.formationId);
      done(ctx, "ajouter_etape", summary);
      return json({ ok: true, etapeId: step.id, message: `Étape « ${nom} » ajoutée en P${phase}.` });
    },
  });

  // Charge une étape modifiable : sa version doit être en brouillon.
  async function draftStep(stepId: string) {
    const step = await prisma.stepTemplate.findUnique({
      where: { id: stepId },
      include: { processTemplate: { select: { formationVersionId: true } } },
    });
    if (!step) return { ok: false as const, error: "Étape introuvable." };
    const loaded = await draftVersion(step.processTemplate.formationVersionId);
    if (!loaded.ok) return { ok: false as const, error: loaded.error };
    return { ok: true as const, step, version: loaded.version };
  }

  const modifierEtape = betaZodTool({
    name: "modifier_etape",
    description: "Modifie le nom, la phase, la description ou le déclencheur d'une étape de process.",
    inputSchema: z.object({
      etapeId: z.string(),
      nom: z.string().optional(),
      phase: z.number().int().min(0).max(7).optional(),
      description: z.string().optional(),
      declencheur: z.enum(["manual", "time_offset", "event"]).optional(),
      ancre: z.enum(["start_date", "end_date", "signature", "enrollment", "opco_agreement"]).optional(),
      decalageJours: z.number().int().min(-365).max(365).optional(),
    }),
    run: async (input) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas le droit de modifier un process.");
      const loaded = await draftStep(input.etapeId);
      if (!loaded.ok) return refuse(loaded.error);

      const declencheur = input.declencheur ?? loaded.step.triggerType;
      const ancre = input.ancre ?? loaded.step.triggerAnchor ?? undefined;
      if (declencheur !== "manual" && !ancre) return refuse("Un déclencheur automatique demande une ancre.");

      const changes = [
        input.nom ? `nom « ${input.nom} »` : null,
        input.phase !== undefined ? `phase P${input.phase}` : null,
        input.declencheur ? `déclencheur ${declencheur}` : null,
        input.decalageJours !== undefined ? `${input.decalageJours} jours` : null,
      ].filter(Boolean);
      if (changes.length === 0 && input.description === undefined) return refuse("Rien à modifier.");

      const summary = `Modifier l'étape « ${loaded.step.name} » : ${changes.join(", ") || "description"}`;
      if (!ok("modifier_etape")) return propose(ctx, "modifier_etape", summary);

      await prisma.stepTemplate.update({
        where: { id: input.etapeId },
        data: {
          ...(input.nom ? { name: input.nom } : {}),
          ...(input.phase !== undefined ? { phase: input.phase } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          triggerType: declencheur,
          triggerAnchor: declencheur === "manual" ? null : ancre,
          triggerOffsetDays: declencheur === "time_offset" ? (input.decalageJours ?? loaded.step.triggerOffsetDays ?? 0) : null,
        },
      });
      await log(me, "modifier_etape", "formation", loaded.version.formationId);
      done(ctx, "modifier_etape", summary);
      return json({ ok: true, message: `Étape « ${loaded.step.name} » mise à jour.` });
    },
  });

  const supprimerEtape = betaZodTool({
    name: "supprimer_etape",
    description: "Retire une étape du process. Impossible si des sessions l'ont déjà instanciée.",
    inputSchema: z.object({ etapeId: z.string() }),
    run: async ({ etapeId }) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas le droit de modifier un process.");
      const loaded = await draftStep(etapeId);
      if (!loaded.ok) return refuse(loaded.error);

      const instances = await prisma.stepInstance.count({ where: { stepTemplateId: etapeId } });
      if (instances > 0) return refuse("Des sessions ont déjà cette étape à leur checklist : elle ne peut plus être retirée du modèle.");

      const summary = `Supprimer l'étape « ${loaded.step.name} »`;
      if (!ok("supprimer_etape")) return propose(ctx, "supprimer_etape", summary);

      await prisma.stepTemplate.delete({ where: { id: etapeId } });
      await log(me, "supprimer_etape", "formation", loaded.version.formationId);
      done(ctx, "supprimer_etape", summary);
      return json({ ok: true, message: `Étape « ${loaded.step.name} » supprimée.` });
    },
  });

  const archiverProcess = betaZodTool({
    name: "archiver_process",
    description: "Désactive le process d'une version. Rien n'est détruit, et les sessions en cours gardent le leur.",
    inputSchema: z.object({ versionId: z.string() }),
    run: async ({ versionId }) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas le droit de modifier un process.");
      const loaded = await draftVersion(versionId);
      if (!loaded.ok) return refuse(loaded.error);
      const template = await prisma.processTemplate.findFirst({
        where: { formationVersionId: versionId, archivedAt: null },
        select: { id: true, name: true },
      });
      if (!template) return refuse("Aucun process actif sur cette version.");

      const summary = `Désactiver le process « ${template.name} » de ${loaded.version.formation.name}`;
      if (!ok("archiver_process")) return propose(ctx, "archiver_process", summary);

      await prisma.processTemplate.update({ where: { id: template.id }, data: { archivedAt: new Date() } });
      await log(me, "archiver_process", "formation", loaded.version.formationId);
      done(ctx, "archiver_process", summary);
      return json({ ok: true, message: "Process désactivé." });
    },
  });

  // ── Templates de mails ───────────────────────────────────────────────────

  const listerMails = betaZodTool({
    name: "lister_mails",
    description: "Les templates de mails d'une version de formation.",
    inputSchema: z.object({ versionId: z.string() }),
    run: async ({ versionId }) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas accès aux mails.");
      const templates = await prisma.messageTemplate.findMany({
        where: { formationVersionId: versionId, archivedAt: null, formationVersion: { formation: ownedScope(me) } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, subject: true },
      });
      return json(templates.map((t) => ({ id: t.id, nom: t.name, objet: t.subject })));
    },
  });

  const creerMail = betaZodTool({
    name: "creer_mail",
    description:
      "Crée un template de mail sur une version en brouillon. Variables disponibles dans le corps : {{eleve.prenom}}, {{eleve.nom}}, {{formation.nom}}, {{session.nom}}, {{date_debut}}, {{date_fin}}, {{formateur.nom}}, {{lien_espace_eleve}}.",
    inputSchema: z.object({ versionId: z.string(), nom: z.string(), objet: z.string(), corps: z.string() }),
    run: async ({ versionId, nom, objet, corps }) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas le droit de modifier les mails.");
      const loaded = await draftVersion(versionId);
      if (!loaded.ok) return refuse(loaded.error);

      const summary = `Créer le mail « ${nom} » (objet : ${objet})`;
      if (!ok("creer_mail")) return propose(ctx, "creer_mail", summary);

      const template = await prisma.messageTemplate.create({
        data: { formationVersionId: versionId, name: nom, subject: objet, body: corps },
      });
      await log(me, "creer_mail", "formation", loaded.version.formationId);
      done(ctx, "creer_mail", summary);
      return json({ ok: true, mailId: template.id, message: `Mail « ${nom} » créé.` });
    },
  });

  const modifierMail = betaZodTool({
    name: "modifier_mail",
    description: "Modifie le nom, l'objet ou le corps d'un template de mail.",
    inputSchema: z.object({ mailId: z.string(), nom: z.string().optional(), objet: z.string().optional(), corps: z.string().optional() }),
    run: async ({ mailId, nom, objet, corps }) => {
      if (!has(me, "can_edit_process_template")) return refuse("Vous n'avez pas le droit de modifier les mails.");
      const template = await prisma.messageTemplate.findUnique({
        where: { id: mailId },
        select: { id: true, name: true, formationVersionId: true },
      });
      if (!template) return refuse("Mail introuvable.");
      const loaded = await draftVersion(template.formationVersionId);
      if (!loaded.ok) return refuse(loaded.error);
      if (!nom && !objet && !corps) return refuse("Rien à modifier.");

      const summary = `Modifier le mail « ${template.name} »`;
      if (!ok("modifier_mail")) return propose(ctx, "modifier_mail", summary);

      await prisma.messageTemplate.update({
        where: { id: mailId },
        data: { ...(nom ? { name: nom } : {}), ...(objet ? { subject: objet } : {}), ...(corps ? { body: corps } : {}) },
      });
      await log(me, "modifier_mail", "formation", loaded.version.formationId);
      done(ctx, "modifier_mail", summary);
      return json({ ok: true, message: `Mail « ${template.name} » mis à jour.` });
    },
  });

  // ── Séances et émargements ───────────────────────────────────────────────

  const listerSeances = betaZodTool({
    name: "lister_seances",
    description:
      "Les séances de classe virtuelle d'une session : celles qui sont planifiées (date et lien) et celles qui attendent de l'être.",
    inputSchema: z.object({ sessionId: z.string() }),
    run: async ({ sessionId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas accès à cette session.");
      const session = await prisma.session.findFirst({
        where: { id: sessionId, ...sessionScope(me) },
        select: { id: true, formationVersionId: true },
      });
      if (!session) return refuse("Session introuvable dans votre périmètre.");

      const blocks = await prisma.contentBlock.findMany({
        where: { type: "visio", lesson: { module: { formationVersionId: session.formationVersionId } } },
        select: { id: true, payload: true, lesson: { select: { title: true } } },
      });
      const seances = await prisma.seance.findMany({
        where: { sessionId },
        select: { id: true, contentBlockId: true, startsAt: true, joinUrl: true, attendances: { select: { status: true } } },
      });
      const bySeance = new Map(seances.map((s) => [s.contentBlockId, s]));

      return json(blocks.map((b) => {
        const payload = b.payload as { title?: string; durationMinutes?: number };
        const planned = bySeance.get(b.id);
        return {
          blocId: b.id,
          titre: payload.title ?? "Séance",
          lecon: b.lesson?.title ?? null,
          duree: payload.durationMinutes ?? null,
          seanceId: planned?.id ?? null,
          date: planned ? formatDateTime(planned.startsAt) : null,
          lien: planned?.joinUrl ?? null,
          emargement: planned && planned.attendances.length > 0
            ? `${planned.attendances.filter((a) => a.status === "signed").length}/${planned.attendances.length} signé(s)`
            : "pas ouvert",
        };
      }));
    },
  });

  const planifierSeance = betaZodTool({
    name: "planifier_seance",
    description:
      "Fixe la date et le lien d'une séance de classe virtuelle pour une session. Le bloc de contenu dit quoi et combien de temps ; c'est ici qu'on dit quand et où.",
    inputSchema: z.object({
      sessionId: z.string(),
      blocId: z.string().describe("Identifiant du bloc visio, obtenu par lister_seances"),
      dateHeure: z.string().describe("Date et heure locales, ex. 2026-11-12T14:00"),
      lien: z.string().describe("URL https de la classe virtuelle (Meet, Zoom…)"),
    }),
    run: async ({ sessionId, blocId, dateHeure, lien }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de planifier une séance.");
      const summary = `Planifier une classe virtuelle le ${dateHeure.replace("T", " à ")}`;
      if (!ok("planifier_seance")) return propose(ctx, "planifier_seance", summary);

      // On délègue à l'action de l'application : mêmes vérifications que l'écran.
      // La durée vient du bloc de contenu : elle appartient au modèle, pas
      // à la planification.
      const result = await planSeance({ sessionId, contentBlockId: blocId, startsAt: dateHeure, joinUrl: lien });
      if (!result.ok) return refuse(result.message);
      await log(me, "planifier_seance", "session", sessionId);
      done(ctx, "planifier_seance", summary);
      return json({ ok: true, message: result.message });
    },
  });

  const ouvrirEmargement = betaZodTool({
    name: "ouvrir_emargement",
    description:
      "Ouvre l'émargement d'une séance : fige les présents, génère la feuille et lance les signatures. Un absent n'est jamais signataire.",
    inputSchema: z.object({
      seanceId: z.string(),
      presentsIds: z.array(z.string()).describe("Identifiants des élèves présents"),
    }),
    run: async ({ seanceId, presentsIds }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit d'ouvrir un émargement.");
      const summary = `Ouvrir l'émargement de la séance avec ${presentsIds.length} présent(s)`;
      if (!ok("ouvrir_emargement")) return propose(ctx, "ouvrir_emargement", summary);

      const result = await openSeance({ seanceId, presentUserIds: presentsIds });
      if (!result.ok) return refuse(result.message);
      await log(me, "ouvrir_emargement", "session", seanceId);
      done(ctx, "ouvrir_emargement", summary);
      return json({ ok: true, message: result.message });
    },
  });

  const relancerEmargement = betaZodTool({
    name: "relancer_emargement",
    description: "Relance les signataires d'une feuille d'émargement qui n'ont pas encore signé.",
    inputSchema: z.object({ documentId: z.string().describe("Identifiant de la feuille d'émargement") }),
    run: async ({ documentId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de relancer.");
      const summary = "Relancer les signataires de la feuille d'émargement";
      if (!ok("relancer_emargement")) return propose(ctx, "relancer_emargement", summary);

      const result = await remindSeance(documentId);
      if (!result.ok) return refuse(result.message);
      done(ctx, "relancer_emargement", summary);
      return json({ ok: true, message: result.message });
    },
  });

  const cloreEmargement = betaZodTool({
    name: "clore_emargement",
    description:
      "Clôt une feuille d'émargement : les signatures manquantes sont constatées comme non recueillies. Irréversible.",
    inputSchema: z.object({ documentId: z.string() }),
    run: async ({ documentId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de clore un émargement.");
      const summary = "Clore la feuille d'émargement (les signatures manquantes seront constatées)";
      if (!ok("clore_emargement")) return propose(ctx, "clore_emargement", summary);

      const result = await closeSeance(documentId);
      if (!result.ok) return refuse(result.message);
      await log(me, "clore_emargement", "document", documentId);
      done(ctx, "clore_emargement", summary);
      return json({ ok: true, message: result.message });
    },
  });

  // ── Export ───────────────────────────────────────────────────────────────

  const lienExport = betaZodTool({
    name: "lien_export",
    description:
      "Donne le lien de téléchargement du dossier de preuve (ZIP) d'une session ou d'un élève. L'assistant ne télécharge rien lui-même : il fournit le lien.",
    inputSchema: z.object({ sessionId: z.string().optional(), eleveId: z.string().optional() }),
    run: async ({ sessionId, eleveId }) => {
      if (!has(me, "can_export_dossier")) return refuse("Vous n'avez pas le droit d'exporter un dossier.");
      if (!sessionId && !eleveId) return refuse("Précisez une session ou un élève.");
      if (sessionId) {
        const session = await prisma.session.findFirst({ where: { id: sessionId, ...sessionScope(me) }, select: { id: true, name: true } });
        if (!session) return refuse("Session introuvable dans votre périmètre.");
        return json({ lien: `/api/exports?session=${session.id}`, message: `Dossier de « ${session.name} »` });
      }
      const student = await prisma.user.findFirst({
        where: { id: eleveId, enrollments: { some: { session: sessionScope(me) } } },
        select: { id: true, name: true },
      });
      if (!student) return refuse("Élève introuvable dans votre périmètre.");
      return json({ lien: `/api/exports?eleve=${student.id}`, message: `Dossier de ${student.name}` });
    },
  });

  // ── Checklist d'une session ──────────────────────────────────────────────

  const cocherEtape = betaZodTool({
    name: "cocher_etape",
    description: "Marque une étape de la checklist d'une session comme faite, ou la remet à faire.",
    inputSchema: z.object({ etapeInstanceId: z.string(), statut: z.enum(["done", "pending", "skipped"]) }),
    run: async ({ etapeInstanceId, statut }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas le droit de modifier une checklist.");
      const instance = await prisma.stepInstance.findFirst({
        where: { id: etapeInstanceId, session: sessionScope(me) },
        select: { id: true, session: { select: { name: true } }, stepTemplate: { select: { name: true } } },
      });
      if (!instance) return refuse("Étape introuvable dans votre périmètre.");

      const label = statut === "done" ? "faite" : statut === "skipped" ? "ignorée" : "à faire";
      const summary = `Marquer « ${instance.stepTemplate.name} » comme ${label} sur ${instance.session.name}`;
      if (!ok("cocher_etape")) return propose(ctx, "cocher_etape", summary);

      await prisma.stepInstance.update({
        where: { id: etapeInstanceId },
        data: { status: statut, doneAt: statut === "done" ? new Date() : null, doneById: statut === "done" ? me.id : null },
      });
      done(ctx, "cocher_etape", summary);
      return json({ ok: true, message: `Étape marquée ${label}.` });
    },
  });

  const checklistSession = betaZodTool({
    name: "checklist_session",
    description: "La checklist d'une session : ses étapes, leur échéance et leur état.",
    inputSchema: z.object({ sessionId: z.string() }),
    run: async ({ sessionId }) => {
      if (!has(me, "can_manage_sessions")) return refuse("Vous n'avez pas accès à cette session.");
      const session = await prisma.session.findFirst({ where: { id: sessionId, ...sessionScope(me) }, select: { id: true, name: true } });
      if (!session) return refuse("Session introuvable dans votre périmètre.");

      const steps = await prisma.stepInstance.findMany({
        where: { sessionId },
        orderBy: [{ stepTemplate: { order: "asc" } }],
        select: {
          id: true, status: true, dueDate: true,
          stepTemplate: { select: { name: true, phase: true } },
        },
      });
      return json({
        session: session.name,
        etapes: steps.map((s) => ({
          id: s.id, nom: s.stepTemplate.name, phase: `P${s.stepTemplate.phase}`,
          echeance: s.dueDate ? formatDate(s.dueDate) : null, etat: s.status,
        })),
      });
    },
  });

  return [
    listerProcess, ajouterEtape, modifierEtape, supprimerEtape, archiverProcess,
    listerMails, creerMail, modifierMail,
    listerSeances, planifierSeance, ouvrirEmargement, relancerEmargement, cloreEmargement,
    checklistSession, cocherEtape, lienExport,
  ];
}

export const PROCESS_WRITE_TOOLS = [
  "ajouter_etape", "modifier_etape", "supprimer_etape", "archiver_process",
  "creer_mail", "modifier_mail",
  "planifier_seance", "ouvrir_emargement", "relancer_emargement", "clore_emargement",
  "cocher_etape",
];
