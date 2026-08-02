import { describe, it, expect } from "vitest";
import { coverageOf, extractKeywords, significantTokens, tokenize } from "@/lib/resume-analysis/KeywordExtractor";

/**
 * Keyword extraction (Resume AI · Phase 3).
 *
 * The tokenizer cases matter more than the ranking ones. `c++`, `c#` and
 * `node.js` are three distinct skills that a naive `\w+` tokenizer turns into
 * `c` and `node` — and `c` then matches almost every document, inflating every
 * score that touches keywords.
 */

describe("tokenize", () => {
  it("keeps the punctuation that is part of a technology's name", () => {
    expect(tokenize("C++ and C# and Node.js")).toContain("c++");
    expect(tokenize("C++ and C# and Node.js")).toContain("c#");
    expect(tokenize("C++ and C# and Node.js")).toContain("node.js");
  });

  it("splits on the separators postings actually use", () => {
    expect(tokenize("Go, Rust; Python | Java / Scala")).toEqual([
      "go", "rust", "python", "java", "scala",
    ]);
  });

  it("strips leading and trailing punctuation without gutting the token", () => {
    expect(tokenize("-Go- .Net.")).toEqual(["go", "net"]);
  });

  it("drops one-character noise", () => {
    expect(tokenize("a b go")).toEqual(["go"]);
  });
});

describe("significantTokens", () => {
  it("removes ordinary stopwords", () => {
    expect(significantTokens("we are looking for the best")).toEqual(["best"]);
  });

  it("removes job-posting boilerplate that matches everything", () => {
    // These appear in every posting; matching on them says nothing.
    const tokens = significantTokens("The ideal candidate has strong experience and skills");
    expect(tokens).not.toContain("candidate");
    expect(tokens).not.toContain("experience");
    expect(tokens).not.toContain("skills");
  });

  it("drops bare numbers", () => {
    expect(significantTokens("kafka 2024 postgres")).toEqual(["kafka", "postgres"]);
  });
});

describe("extractKeywords", () => {
  it("ranks by frequency, most frequent first", () => {
    const text = "kafka kafka kafka postgres postgres redis";
    expect(extractKeywords(text).map((k) => k.term)).toEqual(["kafka", "postgres", "redis"]);
  });

  it("breaks ties alphabetically so the ranking is stable", () => {
    const first = extractKeywords("redis kafka postgres").map((k) => k.term);
    const second = extractKeywords("redis kafka postgres").map((k) => k.term);
    expect(first).toEqual(second);
    expect(first).toEqual(["kafka", "postgres", "redis"]);
  });

  it("keeps a recurring two-word phrase as one term", () => {
    const text = "event sourcing is core. we use event sourcing daily. event sourcing again.";
    const terms = extractKeywords(text).map((k) => k.term);
    expect(terms).toContain("event sourcing");
  });

  it("suppresses a unigram absorbed by a stronger phrase", () => {
    // "sourcing" only ever occurs inside "event sourcing", so it should not
    // compete as its own keyword.
    const text = "event sourcing. event sourcing. event sourcing.";
    const terms = extractKeywords(text).map((k) => k.term);
    expect(terms).toContain("event sourcing");
    expect(terms).not.toContain("sourcing");
  });

  it("does not promote a one-off word pairing to a phrase", () => {
    const terms = extractKeywords("kafka redis postgres").map((k) => k.term);
    expect(terms.every((t) => !t.includes(" "))).toBe(true);
  });

  it("returns nothing for empty or stopword-only text", () => {
    expect(extractKeywords("")).toEqual([]);
    expect(extractKeywords("the and or but")).toEqual([]);
  });

  it("respects the limit", () => {
    const text = Array.from({ length: 60 }, (_, i) => `term${i} term${i}`).join(" ");
    expect(extractKeywords(text, 10)).toHaveLength(10);
  });
});

describe("coverageOf", () => {
  it("matches on token boundaries, not substrings", () => {
    // "go" must not match "going" — the classic false positive.
    const { matched, missing } = coverageOf(["go"], "We are going to the shop");
    expect(matched).toEqual([]);
    expect(missing).toEqual(["go"]);
  });

  it("matches a whole token", () => {
    const { matched } = coverageOf(["go", "kafka"], "We use Go and Kafka in production");
    expect(matched).toEqual(["go", "kafka"]);
  });

  it("matches a phrase as an ordered sequence", () => {
    const { matched } = coverageOf(["event sourcing"], "we migrated to event sourcing last year");
    expect(matched).toEqual(["event sourcing"]);
  });

  it("does not match a phrase whose words appear apart", () => {
    const { missing } = coverageOf(["event sourcing"], "event handling and data sourcing");
    expect(missing).toEqual(["event sourcing"]);
  });
});
