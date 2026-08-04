/**
 * Word-level diff (Resume AI · Feature 2).
 *
 * Pure, dependency-free, and small on purpose. A rewrite the operator cannot
 * audit is one they paste blindly or discard, so the side-by-side view has to
 * show precisely what moved rather than two blocks of prose to compare by eye.
 *
 * Algorithm: longest common subsequence over word tokens, computed with the
 * standard O(n·m) table. Resume sections are hundreds of words, not millions,
 * so the quadratic table costs microseconds and buys an exact result — a
 * heuristic differ would mark spurious changes and quietly undermine the point
 * of showing the diff at all.
 *
 * ponytail: O(n·m) table, capped by MAX_TOKENS. If a section ever legitimately
 * exceeds that, switch to a patience/Myers diff rather than raising the cap.
 */

export type DiffOp = "equal" | "insert" | "delete";

export interface DiffToken {
  op: DiffOp;
  /** The token including any trailing whitespace, so joining reproduces the text. */
  value: string;
}

/**
 * Above this, fall back to a line-level result rather than building the table.
 * 2,000 tokens is roughly 12,000 characters — twice the section input ceiling.
 */
const MAX_TOKENS = 2000;

/**
 * Split into words while keeping the whitespace attached.
 *
 * Whitespace rides with the preceding token so `tokens.join("")` is exactly the
 * input. Rebuilding text from a diff that dropped its spacing is how a "diff
 * view" starts disagreeing with the text it claims to describe.
 */
export function tokenize(value: string): string[] {
  return value.match(/\S+\s*|\s+/g) ?? [];
}

/** Compare ignoring case and surrounding whitespace — re-spacing is not a change. */
function same(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Diff two strings at word level.
 *
 * Returns tokens in output order: equal and delete tokens follow the original,
 * insert tokens follow the rewrite, so a renderer can show one side by skipping
 * inserts and the other by skipping deletes.
 */
export function diffWords(original: string, rewritten: string): DiffToken[] {
  const a = tokenize(original);
  const b = tokenize(rewritten);

  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return b.map((value) => ({ op: "insert" as const, value }));
  if (b.length === 0) return a.map((value) => ({ op: "delete" as const, value }));

  // Guard the table. Whole-block replace is honest here — it says "this changed"
  // without claiming a token-level precision we declined to compute.
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      { op: "delete", value: original },
      { op: "insert", value: rewritten },
    ];
  }

  // lcs[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = same(a[i], b[j])
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (same(a[i], b[j])) {
      // Keep the rewrite's token so casing and spacing shown are what will be copied.
      out.push({ op: "equal", value: b[j] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ op: "delete", value: a[i] });
      i += 1;
    } else {
      out.push({ op: "insert", value: b[j] });
      j += 1;
    }
  }

  while (i < a.length) {
    out.push({ op: "delete", value: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ op: "insert", value: b[j] });
    j += 1;
  }

  return out;
}

/** How much of the original survived, 0–1. Used to label a rewrite's aggressiveness. */
export function changeRatio(tokens: DiffToken[]): number {
  const changed = tokens.filter((t) => t.op !== "equal").length;
  return tokens.length === 0 ? 0 : changed / tokens.length;
}
