import "server-only";
import { getOpportunity, listOpportunities } from "@/lib/opportunities";
import type { Opportunity } from "@/types/opportunity";
import { optionalIntArg, requireStringArg, type AiTool, type AiToolContext } from "../tool";

/**
 * Read-only opportunity tools (Phase 3 · M6).
 *
 * The reference implementation of the tool contract: thin wrappers over the
 * Phase-2 data layer, so an agent read runs the same code path (and the same
 * RLS) as the UI. They exist in M6 to make the registry's authorization
 * behaviour testable — the full catalogue is M8's work.
 *
 * Owner scoping is asserted in application code, not assumed from the client:
 * under the job path the client is service-role and bypasses RLS entirely
 * (H5). Under the interactive path the assertion is redundant but harmless —
 * defence in depth costs one comparison.
 */

const MAX_SEARCH_RESULTS = 10;

/** The projection an agent sees. Deliberately narrower than the full row. */
function project(row: Opportunity) {
  return {
    id: row.id,
    title: row.title,
    stage: row.stage,
    source: row.source,
    location: row.location,
    locationType: row.location_type,
    employmentType: row.employment_type,
    appliedAt: row.applied_at,
    nextActionAt: row.next_action_at,
    companyName: row.company?.name ?? null,
    updatedAt: row.updated_at,
  };
}

export const getOpportunityTool: AiTool = {
  name: "get_opportunity",
  description:
    "Fetch a single opportunity (job application) by its id, including stage, company and next action.",
  consequence: "read",
  schema: {
    type: "object",
    properties: {
      opportunityId: { type: "string", description: "The opportunity's UUID." },
    },
    required: ["opportunityId"],
    additionalProperties: false,
  },
  async execute(args: Record<string, unknown>, ctx: AiToolContext) {
    const id = requireStringArg(args, "opportunityId");
    const row = await getOpportunity(ctx.client, id);

    // A row belonging to another owner is reported as absent rather than
    // denied — "not found" leaks nothing about what exists.
    if (!row || row.owner_id !== ctx.ownerId) return { found: false as const };

    return { found: true as const, opportunity: project(row) };
  },
};

export const searchOpportunitiesTool: AiTool = {
  name: "search_opportunities",
  description:
    "Search active opportunities by free text and/or pipeline stage. Returns a bounded list of summaries.",
  consequence: "read",
  schema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Free-text search over title and description." },
      stage: { type: "string", description: "Exact pipeline stage to filter by." },
      limit: { type: "number", description: `Maximum results (1-${MAX_SEARCH_RESULTS}).` },
    },
    required: [],
    additionalProperties: false,
  },
  async execute(args: Record<string, unknown>, ctx: AiToolContext) {
    const limit = optionalIntArg(args, "limit", 5, MAX_SEARCH_RESULTS);
    const query = typeof args.query === "string" ? args.query.trim() : undefined;
    const stage = typeof args.stage === "string" ? args.stage.trim() : undefined;

    const result = await listOpportunities(ctx.client, {
      search: query || undefined,
      stage: stage || undefined,
      pageSize: MAX_SEARCH_RESULTS,
      page: 1,
    });

    // Owner filtering happens after the query because the Phase-2 data layer
    // takes no owner filter and is frozen for this milestone. Under the current
    // single-operator model the two are equivalent; a multi-owner deployment
    // must push this predicate into the query so paging stays exact.
    const owned = result.rows.filter((row) => row.owner_id === ctx.ownerId);

    return {
      total: owned.length,
      opportunities: owned.slice(0, limit).map(project),
    };
  },
};
