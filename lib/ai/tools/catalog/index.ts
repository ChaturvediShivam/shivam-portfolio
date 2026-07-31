import "server-only";

/**
 * Tool registration seam (Phase 3 · M6).
 *
 * Importing this module registers the catalogue for its side effects — the same
 * pattern `lib/jobs/register.ts` uses for job handlers, so the registry stays
 * decoupled from the tools it holds. Each milestone that adds tools adds its
 * import here.
 */

import { registerAiTool } from "../registry";
import { getOpportunityTool, searchOpportunitiesTool } from "./opportunities";

registerAiTool(getOpportunityTool); // M6
registerAiTool(searchOpportunitiesTool); // M6
