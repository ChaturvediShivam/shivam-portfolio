import { describe, expect, it } from "vitest";
import { MIN_RESUME_CHARS } from "@/lib/resume/parse";
import { normalizeText } from "@/lib/resume/normalize";

/**
 * The empty-resume floor (production hardening).
 *
 * A scanned PDF is the single most common real failure: pdf.js parses it
 * cleanly, reports the right page count, warns that no text layer was found,
 * and returns an empty string. Nothing downstream treated that as a problem,
 * so it reached the gateway and billed four calls to analyse nothing.
 *
 * The floor is enforced in `validate()` inside the server action — the trust
 * boundary that must hold — and mirrored in the workspace so the button
 * explains itself rather than the request failing after a round trip.
 */

describe("MIN_RESUME_CHARS", () => {
  it("is high enough to reject an empty extraction", () => {
    expect(MIN_RESUME_CHARS).toBeGreaterThan(0);
    expect("".trim().length).toBeLessThan(MIN_RESUME_CHARS);
  });

  it("rejects the whitespace-only text a scan produces", () => {
    // pdf.js can return page separators with no glyphs at all.
    const scanned = normalizeText("\n\n   \n\t\n").text;
    expect(scanned.trim().length).toBeLessThan(MIN_RESUME_CHARS);
  });

  it("rejects a header-only extraction — a scan where only the name is selectable", () => {
    const headerOnly = normalizeText("JANE DOE\njane@example.com\n+1 555 0100").text;
    expect(headerOnly.trim().length).toBeLessThan(MIN_RESUME_CHARS);
  });

  it("accepts a genuinely short but real resume", () => {
    // Deliberately terse — the floor must not reject a real document.
    const terse = normalizeText(
      [
        "JANE DOE — Backend Engineer",
        "Six years building payment services in Go and PostgreSQL.",
        "EXPERIENCE",
        "Acme Ltd, 2020-2026. Owned the settlement pipeline and its on-call rotation.",
        "Rebuilt reconciliation, cutting month-end close from four days to one.",
        "EDUCATION",
        "BSc Computer Science, 2019.",
      ].join("\n"),
    ).text;
    expect(terse.trim().length).toBeGreaterThanOrEqual(MIN_RESUME_CHARS);
  });

  it("is not so high that it rejects a one-page CV", () => {
    // Sanity bound: 200 chars is ~30 words. Anything above ~800 would start
    // refusing real documents.
    expect(MIN_RESUME_CHARS).toBeLessThanOrEqual(800);
  });
});
