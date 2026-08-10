import type { AITool } from "./types";
import type { AIUserContext } from "./context";
import { businessTools } from "./tools";
import { standardReportTools } from "./tools/report-tools";
import { createCustomReportTools } from "./tools/custom-report-tools";
import { chartTools } from "./tools/chart-tools";

/**
 * Assemble the full tool set for a chat request based on the authenticated user.
 * - All roles receive operational tools + standard report tools + chart tools.
 * - superadmin / Accountant also receive custom schema/SQL report tools.
 */
export function getToolsForUser(ctx: AIUserContext): AITool[] {
  return [
    ...businessTools,
    ...standardReportTools,
    ...chartTools,
    ...createCustomReportTools(ctx),
  ];
}

export { standardReportTools } from "./tools/report-tools";
export { createCustomReportTools } from "./tools/custom-report-tools";
export { chartTools } from "./tools/chart-tools";
