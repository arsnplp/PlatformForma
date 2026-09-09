import "server-only";

import { readTools } from "./tools-read";
import { writeTools, WRITE_TOOLS } from "./tools-write";
import type { ToolContext } from "./context";

// L'outillage complet de Mini Arsène : lire, puis agir. La séparation n'est
// pas cosmétique — seuls les seconds passent par une confirmation.
export function buildTools(ctx: ToolContext) {
  return [...readTools(ctx), ...writeTools(ctx)];
}

export { WRITE_TOOLS };
export type { ToolContext };
