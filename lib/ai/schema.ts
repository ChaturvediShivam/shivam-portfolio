import "server-only";
import type { JsonSchema } from "@/types/ai";
import { AiInvalidOutputError } from "@/lib/ai/errors";

/**
 * Minimal JSON Schema validation (Phase 3 · M6).
 *
 * Dependency-free, matching the house style of `lib/validation.ts`. It covers
 * the subset our templates use — object/string/number/boolean/array, `required`,
 * `properties`, `items`, `additionalProperties: false` — and rejects anything it
 * cannot verify rather than waving it through.
 *
 * Why validate at all when providers can constrain output natively: not every
 * provider supports schema-constrained generation (the capability flag says
 * so), and even those that do are a remote system whose guarantee we cannot
 * audit. This check is the actual contract; the provider feature is an
 * optimisation that makes it pass more often.
 */

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function check(value: unknown, schema: JsonSchema, path: string): void {
  const expected = schema.type;

  if (typeof expected === "string") {
    const actual = typeOf(value);
    const matches =
      expected === actual || (expected === "integer" && actual === "number" && Number.isInteger(value));
    if (!matches) {
      throw new AiInvalidOutputError(`Expected ${expected} at ${path}, received ${actual}.`);
    }
  }

  if (expected === "object") {
    const object = value as Record<string, unknown>;
    const properties = (schema.properties ?? {}) as Record<string, JsonSchema>;

    const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
    for (const key of required) {
      if (!(key in object)) throw new AiInvalidOutputError(`Missing required field "${key}" at ${path}.`);
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(object)) {
        if (!(key in properties)) {
          throw new AiInvalidOutputError(`Unexpected field "${key}" at ${path}.`);
        }
      }
    }

    for (const [key, childSchema] of Object.entries(properties)) {
      if (key in object) check(object[key], childSchema, `${path}.${key}`);
    }
  }

  if (expected === "array" && schema.items) {
    const items = schema.items as JsonSchema;
    (value as unknown[]).forEach((entry, index) => check(entry, items, `${path}[${index}]`));
  }
}

/**
 * Parse a model reply as JSON and validate it.
 *
 * Tolerates the common wrapping of JSON in a fenced code block, which some
 * providers emit when schema constraints are unsupported and the instruction
 * came from the prompt instead.
 */
export function parseAndValidate<T>(text: string, schema: JsonSchema): T {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```$/, "").trim()
    : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    throw new AiInvalidOutputError("Model reply was not valid JSON.");
  }

  check(parsed, schema, "$");
  return parsed as T;
}
