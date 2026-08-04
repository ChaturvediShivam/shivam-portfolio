/**
 * Keyword extraction (Resume AI · Phase 3).
 *
 * Pure and deterministic: the same text always yields the same ranked terms.
 * No model, no corpus, no network.
 *
 * The ranking is frequency over a stopword-filtered token stream, with two
 * adjustments that matter for job postings specifically:
 *
 *   • Bigrams are extracted alongside unigrams, because "event sourcing" and
 *     "distributed systems" are single concepts whose parts mean much less
 *     apart. A unigram is dropped when it only ever appears inside a bigram
 *     that scored higher, so "sourcing" does not compete with "event sourcing".
 *   • Terms appearing once in a long document are excluded. In a job posting a
 *     genuine requirement is almost always restated — in the summary, the
 *     bullets, or the nice-to-haves — while boilerplate ("opportunity",
 *     "environment") appears once and would otherwise outrank real signal.
 */

/**
 * Words carrying no discriminating value in a resume or posting.
 *
 * Deliberately includes job-posting boilerplate ("candidate", "role", "team")
 * on top of ordinary English stopwords: those words appear in every posting, so
 * matching on them tells the operator nothing.
 */
const STOPWORDS = new Set([
  // Ordinary English
  "a","an","and","are","as","at","be","been","being","but","by","can","could","did","do","does",
  "doing","for","from","had","has","have","having","he","her","here","hers","him","his","how","i",
  "if","in","into","is","it","its","me","more","most","my","no","nor","not","of","on","once","only",
  "or","other","our","ours","out","over","own","same","she","should","so","some","such","than","that",
  "the","their","theirs","them","then","there","these","they","this","those","through","to","too",
  "under","until","up","very","was","we","were","what","when","where","which","while","who","whom",
  "why","will","with","would","you","your","yours","all","also","any","both","each","few","further",
  "just","now","own","s","t","don","shall","may","might","must","across","within","using","use",
  // Job-posting boilerplate
  "ability","able","about","applicant","applicants","apply","candidate","candidates","company",
  "description","employee","employees","experience","experienced","excellent","following","good",
  "great","help","including","job","join","knowledge","level","look","looking","new","opportunity",
  "opportunities","plus","position","preferred","proven","required","requirements","responsibilities",
  "role","roles","skill","skills","strong","team","teams","work","working","years","year","etc",
  "including","ideal","successful","related","field","similar","equivalent","relevant","minimum",
]);

/** Tokens shorter than this are noise once stopwords are gone. */
const MIN_TOKEN_LENGTH = 2;

/** Above this many tokens, a term appearing once is treated as incidental. */
const SINGLETON_CUTOFF_TOKENS = 120;

export interface Keyword {
  term: string;
  count: number;
  /** True when the term is a two-word phrase. */
  phrase: boolean;
}

/**
 * Split text into comparable tokens.
 *
 * Keeps `+`, `#` and `.` inside words so `c++`, `c#` and `node.js` survive as
 * single tokens — dropping them would turn three distinct skills into `c` and
 * `node`, which match almost anything.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .split(/[\s,;:|/]+/)
    .map((token) => token.replace(/^[-.]+|[-.]+$/g, ""))
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

/** Tokens with stopwords and bare numbers removed. */
export function significantTokens(text: string): string[] {
  return tokenize(text).filter((token) => !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/**
 * Rank the terms that characterise a document.
 *
 * Returns unigrams and bigrams together, most frequent first, with ties broken
 * alphabetically so the output is stable across runs — a ranking that reshuffled
 * between identical inputs would make the UI look non-deterministic.
 */
export function extractKeywords(text: string, limit = 30): Keyword[] {
  const tokens = significantTokens(text);
  if (tokens.length === 0) return [];

  const unigrams = new Map<string, number>();
  for (const token of tokens) unigrams.set(token, (unigrams.get(token) ?? 0) + 1);

  const bigrams = new Map<string, number>();
  for (let index = 0; index + 1 < tokens.length; index += 1) {
    // A word next to itself is repetition, not a phrase. Without this guard a
    // document that says "kafka kafka" anywhere yields a "kafka kafka" keyword,
    // which then also absorbs the real "kafka" unigram.
    if (tokens[index] === tokens[index + 1]) continue;
    const phrase = `${tokens[index]} ${tokens[index + 1]}`;
    bigrams.set(phrase, (bigrams.get(phrase) ?? 0) + 1);
  }

  // A bigram is only worth keeping if it recurs; otherwise it is an accident of
  // two words happening to sit next to each other once.
  const keptPhrases = [...bigrams.entries()].filter(([, count]) => count >= 2);

  // Suppress a unigram whose every occurrence is inside a kept phrase.
  const absorbed = new Set<string>();
  for (const [phrase, phraseCount] of keptPhrases) {
    for (const part of phrase.split(" ")) {
      if ((unigrams.get(part) ?? 0) <= phraseCount) absorbed.add(part);
    }
  }

  const singletonCutoff = tokens.length >= SINGLETON_CUTOFF_TOKENS ? 2 : 1;

  const candidates: Keyword[] = [
    ...[...unigrams.entries()]
      .filter(([term, count]) => !absorbed.has(term) && count >= singletonCutoff)
      .map(([term, count]) => ({ term, count, phrase: false })),
    ...keptPhrases.map(([term, count]) => ({ term, count, phrase: true })),
  ];

  return candidates
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, limit);
}

/**
 * Proportion of `terms` present in `text`.
 *
 * Matched on token boundaries rather than substrings: `go` must not match
 * `going`, and `r` must not match every word containing the letter.
 */
export function coverageOf(terms: string[], text: string): { matched: string[]; missing: string[] } {
  const haystack = new Set(tokenize(text));
  const joined = tokenize(text).join(" ");

  const matched: string[] = [];
  const missing: string[] = [];

  for (const term of terms) {
    const present = term.includes(" ") ? joined.includes(term) : haystack.has(term);
    (present ? matched : missing).push(term);
  }

  return { matched, missing };
}
