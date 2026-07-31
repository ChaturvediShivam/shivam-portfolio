import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import "@/lib/ai/tools/catalog";
import { executeAiTool, listAiTools, lookupAiTool, registerAiTool, toolSpecs } from "@/lib/ai/tools/registry";
import { getOpportunityTool, searchOpportunitiesTool } from "@/lib/ai/tools/catalog/opportunities";
import type { AiTool, AiToolContext } from "@/lib/ai/tools/tool";
import { AiApprovalRequiredError, AiUnknownToolError } from "@/lib/ai/errors";

/**
 * A chainable PostgREST-shaped stub. Every builder method returns itself and the
 * object is awaitable, which is enough to drive the Phase-2 data layer.
 */
function stubClient(result: { data: unknown; error: null | { message: string }; count?: number }) {
  const query: Record<string, unknown> = {};
  const chain = ["select", "eq", "is", "textSearch", "order", "range", "limit", "gte", "insert"];
  for (const method of chain) query[method] = () => query;
  query.maybeSingle = () => Promise.resolve(result);
  query.single = () => Promise.resolve(result);
  query.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return { from: () => query } as unknown as SupabaseClient;
}

function ctx(client: SupabaseClient, ownerId = "owner-1"): AiToolContext {
  return { client, ownerId, actor: "agent" };
}

const OWNED_ROW = {
  id: "opp-1",
  title: "Senior Engineer",
  stage: "interview",
  source: "linkedin",
  location: "Remote",
  location_type: "remote",
  employment_type: "full_time",
  applied_at: null,
  next_action_at: null,
  updated_at: "2026-07-01T00:00:00Z",
  owner_id: "owner-1",
  company: { name: "Acme" },
};

describe("tool registry", () => {
  it("registers the M6 read catalogue", () => {
    expect(lookupAiTool("get_opportunity")).toBeDefined();
    expect(lookupAiTool("search_opportunities")).toBeDefined();
  });

  it("registers no write or external tools in M6", () => {
    expect(listAiTools("write")).toHaveLength(0);
    expect(listAiTools("external")).toHaveLength(0);
  });

  it("exposes provider-independent specs", () => {
    const specs = toolSpecs("read");
    expect(specs.length).toBeGreaterThan(0);
    for (const spec of specs) {
      expect(spec).toHaveProperty("name");
      expect(spec).toHaveProperty("description");
      expect(spec.schema).toHaveProperty("type", "object");
    }
  });

  it("rejects a hallucinated tool name instead of dispatching it", async () => {
    await expect(executeAiTool("definitely_not_a_tool", {}, ctx(stubClient({ data: null, error: null })))).rejects.toThrow(
      AiUnknownToolError,
    );
  });
});

describe("consequence policy", () => {
  const writeTool: AiTool = {
    name: "test_write_tool",
    description: "A write tool used to prove the policy gate.",
    consequence: "write",
    schema: { type: "object", properties: {}, additionalProperties: false },
    async execute() {
      throw new Error("must never execute in M6");
    },
  };

  const externalTool: AiTool = { ...writeTool, name: "test_external_tool", consequence: "external" };

  it("refuses a write tool — the approval queue is M9", async () => {
    registerAiTool(writeTool);
    await expect(executeAiTool("test_write_tool", {}, ctx(stubClient({ data: null, error: null })))).rejects.toThrow(
      AiApprovalRequiredError,
    );
  });

  it("refuses an external tool", async () => {
    registerAiTool(externalTool);
    await expect(
      executeAiTool("test_external_tool", {}, ctx(stubClient({ data: null, error: null }))),
    ).rejects.toThrow(AiApprovalRequiredError);
  });
});

describe("get_opportunity", () => {
  it("returns a narrowed projection for the caller's own row", async () => {
    const client = stubClient({ data: OWNED_ROW, error: null });
    const result = (await getOpportunityTool.execute({ opportunityId: "opp-1" }, ctx(client))) as {
      found: boolean;
      opportunity: Record<string, unknown>;
    };

    expect(result.found).toBe(true);
    expect(result.opportunity.title).toBe("Senior Engineer");
    expect(result.opportunity.companyName).toBe("Acme");
    // The projection must not leak internals the agent has no use for.
    expect(result.opportunity).not.toHaveProperty("owner_id");
    expect(result.opportunity).not.toHaveProperty("metadata");
  });

  it("reports another owner's row as absent (H5 explicit owner scoping)", async () => {
    const client = stubClient({ data: { ...OWNED_ROW, owner_id: "someone-else" }, error: null });
    const result = await getOpportunityTool.execute({ opportunityId: "opp-1" }, ctx(client));
    expect(result).toEqual({ found: false });
  });

  it("reports a missing row as absent", async () => {
    const client = stubClient({ data: null, error: null });
    expect(await getOpportunityTool.execute({ opportunityId: "nope" }, ctx(client))).toEqual({ found: false });
  });

  it("rejects a missing or non-string id", async () => {
    const client = stubClient({ data: null, error: null });
    await expect(getOpportunityTool.execute({}, ctx(client))).rejects.toThrow(/non-empty string/);
    await expect(getOpportunityTool.execute({ opportunityId: 7 }, ctx(client))).rejects.toThrow(
      /non-empty string/,
    );
  });
});

describe("search_opportunities", () => {
  it("filters out rows belonging to another owner", async () => {
    const client = stubClient({
      data: [OWNED_ROW, { ...OWNED_ROW, id: "opp-2", owner_id: "someone-else" }],
      error: null,
      count: 2,
    });
    const result = (await searchOpportunitiesTool.execute({ query: "engineer" }, ctx(client))) as {
      total: number;
      opportunities: { id: string }[];
    };

    expect(result.total).toBe(1);
    expect(result.opportunities.map((row) => row.id)).toEqual(["opp-1"]);
  });

  it("caps the result count to the requested bounded limit", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ ...OWNED_ROW, id: `opp-${index}` }));
    const client = stubClient({ data: rows, error: null, count: 10 });
    const result = (await searchOpportunitiesTool.execute({ limit: 3 }, ctx(client))) as {
      opportunities: unknown[];
    };
    expect(result.opportunities).toHaveLength(3);
  });

  it("clamps an out-of-range limit rather than trusting it", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({ ...OWNED_ROW, id: `opp-${index}` }));
    const client = stubClient({ data: rows, error: null, count: 10 });
    const result = (await searchOpportunitiesTool.execute({ limit: 9999 }, ctx(client))) as {
      opportunities: unknown[];
    };
    expect(result.opportunities.length).toBeLessThanOrEqual(10);
  });
});
