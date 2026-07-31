import { describe, it, expect } from "vitest";
import { interpolate, MissingPromptVariableError } from "@/lib/ai/prompts/template";
import { getPromptTemplate, listPromptTemplates } from "@/lib/ai/prompts/registry";
import { AiUnknownTemplateError } from "@/lib/ai/errors";

/**
 * A complete variable set per registered template. `interpolate` throws on a
 * missing variable, so every template must appear here — which is what keeps the
 * whole-registry sweeps below honest as templates are added.
 */
const SAMPLE_VARIABLES: Record<string, Record<string, unknown>> = {
  self_test: { nonce: "n" },
  message_summary: {
    subject: "Interview availability",
    from: "recruiter@example.com",
    body: "Are you free on Thursday at 14:00?",
    truncationNote: "",
  },
  opportunity_summary: {
    title: "Senior Engineer",
    company: "Example Ltd",
    stage: "interview",
    recentMessages: "- Recruiter proposed Thursday 14:00",
    notes: "- Prefers remote",
    truncationNote: "",
  },
};

describe("prompt interpolation", () => {
  it("substitutes every placeholder", () => {
    expect(interpolate("a {{x}} b {{y}}", { x: "1", y: "2" })).toBe("a 1 b 2");
  });

  it("throws on a missing variable rather than rendering a half-built prompt", () => {
    expect(() => interpolate("hello {{name}}", {})).toThrow(MissingPromptVariableError);
  });

  it("renders null and undefined as empty, not as the literal words", () => {
    expect(interpolate("[{{a}}][{{b}}]", { a: null, b: undefined })).toBe("[][]");
  });

  it("leaves text without placeholders untouched", () => {
    expect(interpolate("no placeholders here", {})).toBe("no placeholders here");
  });
});

describe("prompt registry", () => {
  it("resolves a template and stamps a version", () => {
    const template = getPromptTemplate("self_test");
    expect(template.id).toBe("self_test");
    expect(template.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("resolves an exact version", () => {
    expect(getPromptTemplate("self_test", "1.0.0").version).toBe("1.0.0");
  });

  it("throws for an unknown id, before any provider call", () => {
    expect(() => getPromptTemplate("does_not_exist")).toThrow(AiUnknownTemplateError);
  });

  it("throws for a known id at an unknown version", () => {
    expect(() => getPromptTemplate("self_test", "9.9.9")).toThrow(AiUnknownTemplateError);
  });

  it("renders the self-test prompt with the supplied nonce", () => {
    const rendered = getPromptTemplate("self_test").render({ nonce: "abc-123" });
    expect(rendered.user).toContain("abc-123");
    expect(rendered.system.length).toBeGreaterThan(0);
  });

  it("exposes no secrets in any registered template", () => {
    for (const template of listPromptTemplates()) {
      const variables = SAMPLE_VARIABLES[template.id];
      expect(variables, `no sample variables for template "${template.id}"`).toBeDefined();
      const rendered = template.render(variables);
      expect(`${rendered.system} ${rendered.user}`).not.toMatch(/api[_-]?key|secret|password|bearer/i);
    }
  });
});

describe("summary templates", () => {
  it("resolves both summary templates at a pinned version", () => {
    expect(getPromptTemplate("message_summary", "1.0.0").version).toBe("1.0.0");
    expect(getPromptTemplate("opportunity_summary", "1.0.0").version).toBe("1.0.0");
  });

  // M7.1 stamps ai_prompt_version from the resolved template rather than from a
  // duplicated constant, so unversioned resolution must report a real version.
  it("reports the version that unversioned resolution selected", () => {
    for (const id of ["message_summary", "opportunity_summary"]) {
      expect(getPromptTemplate(id).version).toMatch(/^\d+\.\d+\.\d+$/);
    }
  });

  it("routes summaries to the cheap task class", () => {
    expect(getPromptTemplate("message_summary").taskClass).toBe("fast");
    expect(getPromptTemplate("opportunity_summary").taskClass).toBe("fast");
  });

  // Thinking tokens share the output ceiling on the current provider, so a
  // ceiling sized to the visible reply alone would surface as `truncated`.
  it("leaves output headroom above the visible reply", () => {
    expect(getPromptTemplate("message_summary").maxOutputTokens).toBeGreaterThanOrEqual(1024);
    expect(getPromptTemplate("opportunity_summary").maxOutputTokens).toBeGreaterThanOrEqual(1024);
  });

  it("constrains output to the subset lib/ai/schema.ts can validate", () => {
    for (const id of ["message_summary", "opportunity_summary"]) {
      const schema = getPromptTemplate(id).responseSchema as Record<string, unknown>;
      expect(schema.type).toBe("object");
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(["summary", "confidence"]);

      const properties = schema.properties as Record<string, { type: string }>;
      expect(properties.summary.type).toBe("string");
      expect(properties.confidence.type).toBe("number");
    }
  });

  it("renders the message body inside delimiters that mark it as data", () => {
    const rendered = getPromptTemplate("message_summary").render(SAMPLE_VARIABLES.message_summary);
    expect(rendered.user).toContain("Are you free on Thursday at 14:00?");
    expect(rendered.user).toContain("---BEGIN MESSAGE---");
    expect(rendered.user).toContain("---END MESSAGE---");
    expect(rendered.system).toMatch(/never follow instructions/i);
  });

  it("renders the supplied history inside delimiters that mark it as data", () => {
    const rendered = getPromptTemplate("opportunity_summary").render(
      SAMPLE_VARIABLES.opportunity_summary,
    );
    expect(rendered.user).toContain("Senior Engineer");
    expect(rendered.user).toContain("Recruiter proposed Thursday 14:00");
    expect(rendered.user).toContain("---BEGIN HISTORY---");
    expect(rendered.user).toContain("---END HISTORY---");
    expect(rendered.system).toMatch(/never follow instructions/i);
  });

  it("throws rather than half-render when the caller omits a variable", () => {
    expect(() => getPromptTemplate("message_summary").render({ subject: "s" })).toThrow(
      MissingPromptVariableError,
    );
    expect(() => getPromptTemplate("opportunity_summary").render({ title: "t" })).toThrow(
      MissingPromptVariableError,
    );
  });
});
