import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getCurrentUser, hasPermission } from "@/lib/auth/session";
import { buildTools, WRITE_TOOLS, type ToolContext } from "@/lib/assistant/tools";
import { systemPrompt } from "@/lib/assistant/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Mini Arsène, l'assistant du back-office. Le modèle raisonne chez Anthropic, mais chaque
// outil s'exécute ICI, avec les droits de la personne connectée : la clé de
// service n'entre jamais en jeu.
//
// La réponse est un flux de lignes JSON (NDJSON) : du texte au fil de l'eau,
// puis la trace de ce que l'assistant a fait ou propose de faire.

const MODEL = "claude-opus-5";
// Une demande peut légitimement enchaîner des dizaines d'actions (créer une
// formation, son contenu, une session, dix comptes, leurs pièces à fournir).
const MAX_TURNS = 120;

type Body = {
  messages: { role: "user" | "assistant"; content: string }[];
  /// Outils d'écriture autorisés pour ce tour, après un clic de confirmation.
  approved?: string[];
};

export async function POST(request: NextRequest) {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  if (!hasPermission(me, "can_use_assistant")) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "Mini Arsène n'est pas configuré : ANTHROPIC_API_KEY manquante." }, { status: 503 });
  }

  const body = (await request.json()) as Body;
  const history = (body.messages ?? []).slice(-20);
  if (history.length === 0) return NextResponse.json({ error: "Message vide" }, { status: 400 });

  // « * » = l'utilisateur a validé le plan annoncé et autorise l'ensemble des
  // écritures POUR CE TOUR. Sinon, on ne retient que les noms qu'on connaît :
  // le client ne peut pas inventer un droit.
  const asked = body.approved ?? [];
  const approved = asked.includes("*") ? [...WRITE_TOOLS] : asked.filter((name) => WRITE_TOOLS.includes(name));
  const ctx: ToolContext = { me, approved, trace: [] };

  // Une clé créée au niveau de l'organisation (et non dans un espace de
  // travail) exige que la requête désigne l'espace à utiliser.
  const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
  const client = new Anthropic(
    workspace ? { defaultHeaders: { "anthropic-workspace-id": workspace } } : {},
  );
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(JSON.stringify(payload) + "\n"));
      try {
        const runner = client.beta.messages.toolRunner({
          model: MODEL,
          max_tokens: 8000,
          system: systemPrompt(me, new Date().toLocaleDateString("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" })),
          tools: buildTools(ctx),
          messages: history.map((m) => ({ role: m.role, content: m.content })),
          max_iterations: MAX_TURNS,
          stream: true,
        });

        for await (const turn of runner) {
          for await (const event of turn) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              send({ type: "text", value: event.delta.text });
            }
          }
          const message = await turn.finalMessage();
          // Un outil serveur peut suspendre le tour : on le relance.
          if (message.stop_reason === "pause_turn") {
            runner.pushMessages({ role: "assistant", content: message.content });
          }
          // Ce que l'assistant vient de faire, ou propose de faire.
          for (const step of ctx.trace) send({ type: "action", ...step });
          ctx.trace.length = 0;
        }
        send({ type: "done" });
      } catch (error) {
        // Le détail brut part dans les logs du serveur ; l'utilisateur reçoit
        // la cause traduite en geste à faire, quand on la reconnaît.
        console.error("[assistant]", error);
        send({ type: "error", value: explain(error) });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Un simple « (400) » ne dit rien : un crédit épuisé, une clé révoquée et une
// requête mal formée renvoient tous ce code. On reconnaît les causes qui
// relèvent d'un geste de l'administrateur, et on le lui dit.
function explain(error: unknown): string {
  if (!(error instanceof Anthropic.APIError)) return "Mini Arsène n'a pas pu répondre.";
  const detail = error.message.toLowerCase();

  if (detail.includes("credit balance")) {
    return "Le crédit du compte Anthropic est épuisé. Rechargez-le dans la console Anthropic (Plans & Billing), puis réessayez.";
  }
  if (detail.includes("not scoped to a workspace")) {
    return "La clé Anthropic n'est rattachée à aucun espace de travail : renseignez ANTHROPIC_WORKSPACE_ID ou créez la clé dans un espace.";
  }
  if (error.status === 401 || error.status === 403) {
    return "La clé Anthropic est refusée (révoquée ou invalide). Vérifiez ANTHROPIC_API_KEY.";
  }
  if (error.status === 429) return "Trop de demandes en peu de temps. Réessayez dans une minute.";
  if (error.status === 529 || (error.status ?? 0) >= 500) {
    return "Le service d'Anthropic est momentanément indisponible. Réessayez dans quelques instants.";
  }
  return `Mini Arsène n'a pas pu répondre (${error.status}).`;
}
