import { describe, it, expect } from "vitest";
import { parseAndValidate } from "@/lib/ai/schema";
import { AiInvalidOutputError } from "@/lib/ai/errors";

const SCHEMA = {
  type: "object",
  properties: {
    echo: { type: "string" },
    ok: { type: "boolean" },
    count: { type: "integer" },
  },
  required: ["echo", "ok"],
  additionalProperties: false,
};

describe("structured output validation", () => {
  it("accepts a conforming object", () => {
    expect(parseAndValidate('{"echo":"a","ok":true}', SCHEMA)).toEqual({ echo: "a", ok: true });
  });

  it("unwraps a fenced code block, which prompt-fallback providers emit", () => {
    expect(parseAndValidate('```json\n{"echo":"a","ok":true}\n```', SCHEMA)).toEqual({
      echo: "a",
      ok: true,
    });
  });

  it("rejects non-JSON", () => {
    expect(() => parseAndValidate("I cannot do that.", SCHEMA)).toThrow(AiInvalidOutputError);
  });

  it("rejects a missing required field", () => {
    expect(() => parseAndValidate('{"echo":"a"}', SCHEMA)).toThrow(/Missing required field "ok"/);
  });

  it("rejects a wrong field type", () => {
    expect(() => parseAndValidate('{"echo":1,"ok":true}', SCHEMA)).toThrow(/Expected string/);
  });

  it("rejects an unexpected field when additionalProperties is false", () => {
    expect(() => parseAndValidate('{"echo":"a","ok":true,"extra":1}', SCHEMA)).toThrow(
      /Unexpected field "extra"/,
    );
  });

  it("accepts an integer but rejects a fractional number for integer fields", () => {
    expect(parseAndValidate('{"echo":"a","ok":true,"count":3}', SCHEMA)).toMatchObject({ count: 3 });
    expect(() => parseAndValidate('{"echo":"a","ok":true,"count":3.5}', SCHEMA)).toThrow(
      AiInvalidOutputError,
    );
  });

  it("validates array items", () => {
    const arraySchema = {
      type: "object",
      properties: { tags: { type: "array", items: { type: "string" } } },
      required: ["tags"],
    };
    expect(parseAndValidate('{"tags":["a","b"]}', arraySchema)).toEqual({ tags: ["a", "b"] });
    expect(() => parseAndValidate('{"tags":["a",2]}', arraySchema)).toThrow(/Expected string at \$\.tags\[1\]/);
  });

  it("rejects a JSON array when an object is required", () => {
    expect(() => parseAndValidate("[1,2,3]", SCHEMA)).toThrow(/Expected object/);
  });
});
