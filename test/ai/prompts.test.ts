import { describe, it, expect } from "vitest";
import { interpolate, MissingPromptVariableError } from "@/lib/ai/prompts/template";
import { getPromptTemplate, listPromptTemplates } from "@/lib/ai/prompts/registry";
import { AiUnknownTemplateError } from "@/lib/ai/errors";

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
      const rendered = template.render({ nonce: "n" });
      expect(`${rendered.system} ${rendered.user}`).not.toMatch(/api[_-]?key|secret|password|bearer/i);
    }
  });
});
