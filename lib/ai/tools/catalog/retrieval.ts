import "server-only";
import { retrieve, RETRIEVAL_ENTITY_TYPES, type RetrievalEntityType } from "@/lib/ai/retrieval";
import { optionalIntArg, requireStringArg, type AiTool, type AiToolContext } from "../tool";

/**
 * Cross-entity retrieval tool (Phase 3 · M8).
 *
 * The copilot's primary way of grounding an answer. One tool rather than seven
 * because the operator's questions do not respect entity boundaries — "what is
 * happening with Acme?" spans the company, its opportunity, the recruiter, the
 * thread and the interview — and making the model choose a table first turns one
 * round trip into several.
 *
 * Retrieval runs through `lib/ai/retrieval.ts`, so this tool inherits its owner
 * scoping and its RLS path without restating either.
 */

const MAX_RESULTS = 25;
const DEFAULT_RESULTS = 12;

/** Ignore unrecognised type names rather than failing the call. */
function parseTypes(value: unknown): RetrievalEntityType[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const types = value.filter((entry): entry is RetrievalEntityType =>
    RETRIEVAL_ENTITY_TYPES.includes(entry as RetrievalEntityType),
  );
  return types.length ? types : undefined;
}

export const searchCrmTool: AiTool = {
  name: "search_crm",
  description:
    "Search the career CRM across opportunities, companies, contacts, messages, tasks, calendar events and notes. " +
    "Returns bounded, ranked excerpts with a link to each record. Use this before answering any question about " +
    "the operator's job search, and cite what it returns rather than recalling from memory.",
  consequence: "read",
  schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Keywords to search for — a company name, role, person, or topic.",
      },
      types: {
        type: "array",
        items: { type: "string", enum: RETRIEVAL_ENTITY_TYPES },
        description: "Restrict the search to these record types. Omit to search everything.",
      },
      limit: { type: "number", description: `Maximum records to return (1-${MAX_RESULTS}).` },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async execute(args: Record<string, unknown>, ctx: AiToolContext) {
    const query = requireStringArg(args, "query");
    const limit = optionalIntArg(args, "limit", DEFAULT_RESULTS, MAX_RESULTS);

    const results = await retrieve(ctx.client, ctx.ownerId, query, {
      types: parseTypes(args.types),
      limit,
    });

    return { total: results.length, results };
  },
};
