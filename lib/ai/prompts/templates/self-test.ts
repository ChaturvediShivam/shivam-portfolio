import "server-only";
import { interpolate, type PromptTemplate } from "@/lib/ai/prompts/template";

/**
 * Self-test template (Phase 3 · M6).
 *
 * The M1 `noop` job's counterpart for the AI layer: the smallest prompt that
 * exercises the whole path — render → budget → provider → mapper → structured
 * output → validation → audit — without doing any domain work.
 *
 * It echoes a server-generated nonce, so a successful run proves the response
 * actually came from this request rather than a cache or a stub.
 */
export const selfTestTemplate: PromptTemplate = {
  id: "self_test",
  version: "1.0.0",
  taskClass: "fast",
  maxOutputTokens: 1024,
  responseSchema: {
    type: "object",
    properties: {
      echo: { type: "string", description: "The nonce, repeated exactly." },
      ok: { type: "boolean", description: "Always true." },
    },
    required: ["echo", "ok"],
    additionalProperties: false,
  },
  render(variables) {
    return {
      system: "You are a connectivity self-test. Reply only with the requested JSON object.",
      user: interpolate(
        "Repeat this nonce exactly in the `echo` field and set `ok` to true: {{nonce}}",
        variables,
      ),
    };
  },
};
