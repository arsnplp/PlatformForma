import "server-only";

import { readTools } from "./tools-read";
import { writeTools, WRITE_TOOLS as CORE_WRITE } from "./tools-write";
import { processTools, PROCESS_WRITE_TOOLS } from "./tools-process";
import type { ToolContext } from "./context";

// L'outillage complet de Mini Arsène : le métier de bout en bout — contenu,
// sessions, personnes, dossier, process, mails, séances, émargements, exports.
export function buildTools(ctx: ToolContext) {
  return [...readTools(ctx), ...writeTools(ctx), ...processTools(ctx)];
}

// Les outils qui écrivent. La route s'en sert pour n'accorder que des droits
// qu'elle connaît, l'interface pour savoir quoi faire confirmer.
export const WRITE_TOOLS = [...CORE_WRITE, ...PROCESS_WRITE_TOOLS];

export type { ToolContext };
