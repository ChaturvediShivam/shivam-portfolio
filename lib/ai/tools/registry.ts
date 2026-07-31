import "server-only";
import { AiApprovalRequiredError, AiUnknownToolError } from "@/lib/ai/errors";
import type { AiToolConsequence, AiToolSpec } from "@/types/ai";
import type { AiTool, AiToolContext } from "./tool";

/**
 * Tool registry + execution policy (Phase 3 · M6).
 *
 * The registry is the catalogue; the policy is the gate. Consequence classing is
 * enforced HERE rather than inside each tool, so a future tool cannot opt itself
 * out of approval by forgetting to check.
 *
 * M6 registers read tools only. The `write`/`external` classes exist and are
 * enforced, but nothing can satisfy them until the approval queue lands in M9 —
 * so the policy's only possible answer for them today is to refuse.
 */

const tools = new Map<string, AiTool>();

export function registerAiTool(tool: AiTool): void {
  tools.set(tool.name, tool);
}

export function lookupAiTool(name: string): AiTool | undefined {
  return tools.get(name);
}

export function listAiTools(consequence?: AiToolConsequence): AiTool[] {
  const all = [...tools.values()];
  return consequence ? all.filter((tool) => tool.consequence === consequence) : all;
}

/** Provider-independent specs for the tools an agent may call. */
export function toolSpecs(consequence: AiToolConsequence = "read"): AiToolSpec[] {
  return listAiTools(consequence).map((tool) => ({
    name: tool.name,
    description: tool.description,
    schema: tool.schema,
  }));
}

/**
 * Execute a model-requested tool call under policy.
 *
 * Throws `AiUnknownToolError` for anything not in the registry — a model may
 * hallucinate a tool name, and that must never become a dynamic dispatch.
 */
export async function executeAiTool(
  name: string,
  args: Record<string, unknown>,
  ctx: AiToolContext,
): Promise<unknown> {
  const tool = lookupAiTool(name);
  if (!tool) throw new AiUnknownToolError(name);
  if (tool.consequence !== "read") throw new AiApprovalRequiredError(name);
  return tool.execute(args, ctx);
}
