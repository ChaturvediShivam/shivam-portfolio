import "server-only";
import type { AiTaskClass, JsonSchema } from "@/types/ai";

/**
 * Prompt templates (Phase 3 · M6).
 *
 * Templates are versioned and live in-repo so they can be reviewed and diffed.
 * The version that produced a row is stamped into that row's `ai_prompt_version`,
 * which is what makes every AI-written field reproducible and auditable.
 *
 * Templates hold no secrets and name no provider — they describe intent
 * (task class, output shape, token ceiling), and the adapter decides how to
 * express that for its vendor.
 */

export interface RenderedPrompt {
  system: string;
  user: string;
}

export interface PromptTemplate {
  readonly id: string;
  /** Semantic version; stamped into `ai_prompt_version`. */
  readonly version: string;
  readonly taskClass: AiTaskClass;
  readonly maxOutputTokens: number;
  /** When set, the reply is schema-constrained and gateway-validated. */
  readonly responseSchema?: JsonSchema;
  render(variables: Record<string, unknown>): RenderedPrompt;
}

/** Thrown when a template references a variable the caller did not supply. */
export class MissingPromptVariableError extends Error {
  constructor(key: string) {
    super(`Missing prompt variable "${key}".`);
    this.name = "MissingPromptVariableError";
  }
}

/**
 * Substitute `{{key}}` placeholders.
 *
 * A missing variable throws rather than rendering an empty string or leaving the
 * placeholder in place — a half-rendered prompt is a silent correctness bug, and
 * failing here costs nothing because it happens before any provider call.
 *
 * Note: values are inserted verbatim. M6 only ever passes server-generated
 * values; treating untrusted content as prompt input requires the injection
 * defences deferred to Phase 5.
 */
export function interpolate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    if (!(key in variables)) throw new MissingPromptVariableError(key);
    const value = variables[key];
    return value === null || value === undefined ? "" : String(value);
  });
}
