import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { DemoActionResult } from "@/lib/demo/publicAction";
import type { DemoAnalysisData } from "@/lib/demo/analysis";

/**
 * The demo's UI, driven through the real components.
 *
 * The server action is the one thing replaced: it is the boundary this suite is
 * about, and calling the real one would need a database, Cloudflare and a
 * provider. Everything on this side of it — the inputs, the submit guard, the
 * result rendering, the fallback copy — is the shipped code.
 *
 * Two properties carry the most weight. One submit must produce exactly one
 * invocation, because every gate and every token downstream is metered per
 * call. And no failure path may render anything but the server's own scrubbed
 * sentence, because the alternative is a stack trace on a public page.
 */

const analyzeDemoAction = vi.fn();
vi.mock("@/app/(marketing)/demo/actions", () => ({
  analyzeDemoAction: (...args: unknown[]) => analyzeDemoAction(...args),
}));

// The widget needs a live Cloudflare script. Replaced with a button that hands
// back a token, so the token plumbing is still exercised.
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: ({ onSuccess }: { onSuccess: (token: string) => void }) => (
    <button type="button" onClick={() => onSuccess("test-token")}>
      solve challenge
    </button>
  ),
}));

// pdfjs cannot run under jsdom. Only the extraction is replaced; validation and
// every downstream decision remain the real ones.
const parseResume = vi.fn();
vi.mock("@/lib/resume/parse", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/resume/parse")>();
  return { ...actual, parseResume: (...args: unknown[]) => parseResume(...args) };
});

import { DemoWorkspace } from "@/components/demo/DemoWorkspace";

function analysis(overrides: Partial<DemoAnalysisData> = {}): DemoAnalysisData {
  return {
    analysis: {
      overallScore: 76,
      breakdown: [
        { category: "skills", weight: 0.35, score: 64, contribution: 22.4, detail: "" },
        { category: "experience", weight: 0.3, score: 100, contribution: 30, detail: "" },
        { category: "education", weight: 0.1, score: 100, contribution: 10, detail: "" },
        { category: "keywords", weight: 0.15, score: 58, contribution: 8.7, detail: "" },
        { category: "responsibilities", weight: 0.1, score: 50, contribution: 5, detail: "" },
      ],
      skillMatches: [
        { skill: "react", displayName: "React", importance: "required", matchedVia: "exact", evidence: "React and", section: "summary" },
      ],
      missingSkills: [
        { skill: "aws", displayName: "AWS", importance: "required", requestedIn: "- AWS" },
      ],
    } as unknown as DemoAnalysisData["analysis"],
    posting: {} as DemoAnalysisData["posting"],
    usedSampleResume: true,
    usedSampleJobDescription: true,
    aiInsights: null,
    aiNote: null,
    ...overrides,
  };
}

const INSIGHTS = {
  overallSummary: "Strong frontend match with an infrastructure gap.",
  strengths: [{ headline: "Deep React background", detail: "Six years in production.", evidence: "React and" }],
  weaknesses: [{ headline: "No cloud experience", detail: "AWS is required.", evidence: "- AWS", severity: "critical", relatedSkill: "aws" }],
  criticalGaps: [],
  transferableSkills: [],
  missingKeywords: [],
  recommendations: [],
  bulletImprovements: [],
  interviewQuestions: [],
  linkedinSuggestions: null,
  resumeSummaryRewrite: null,
  overallHiringProbability: 62,
  reasoning: "",
  aiProvider: "anthropic",
  aiModel: "claude-sonnet-5",
  aiPromptVersion: "1.0.0",
  generatedAt: "2026-08-09T00:00:00.000Z",
  dropped: [],
} as unknown as NonNullable<DemoAnalysisData["aiInsights"]>;

function ok(data: DemoAnalysisData): DemoActionResult<DemoAnalysisData> {
  return { ok: true, data };
}
function fail(
  code: string,
  formError: string,
  extra: Record<string, unknown> = {},
): DemoActionResult<DemoAnalysisData> {
  return { ok: false, code, formError, ...extra } as DemoActionResult<DemoAnalysisData>;
}

/** Resolves only when the test says so, for observing the loading state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

beforeEach(() => {
  analyzeDemoAction.mockReset();
  parseResume.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

const analyzeButton = () => screen.getByRole("button", { name: /analyze resume|try again/i });

describe("page render", () => {
  it("renders both inputs and a submit, with the samples preselected", () => {
    render(<DemoWorkspace siteKey={null} />);

    expect(screen.getByRole("heading", { name: /1 · Resume/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /2 · Job description/i })).toBeInTheDocument();
    expect(analyzeButton()).toBeEnabled();
    // Usable with zero input: the sample is the default on both sides, so both
    // "use the sample" buttons start disabled.
    expect(screen.getByRole("button", { name: /use the sample resume/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /use the sample posting/i })).toBeDisabled();
  });

  it("renders the challenge only when a site key exists", () => {
    const { unmount } = render(<DemoWorkspace siteKey={null} />);
    expect(screen.queryByRole("button", { name: /solve challenge/i })).not.toBeInTheDocument();
    unmount();

    render(<DemoWorkspace siteKey="site-key" />);
    expect(screen.getByRole("button", { name: /solve challenge/i })).toBeInTheDocument();
  });
});

describe("submission", () => {
  it("sends only text, never a parsed structure", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(ok(analysis()));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await waitFor(() => expect(analyzeDemoAction).toHaveBeenCalledTimes(1));
    const payload = analyzeDemoAction.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(
      ["jobDescription", "resumeText", "turnstileToken"].sort(),
    );
    // A ParsedResume would carry these. Their absence is the security property.
    expect(payload).not.toHaveProperty("sections");
    expect(payload).not.toHaveProperty("analysis");
    expect(payload).not.toHaveProperty("overallScore");
  });

  it("forwards the turnstile token once solved", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(ok(analysis()));
    render(<DemoWorkspace siteKey="site-key" />);

    await user.click(screen.getByRole("button", { name: /solve challenge/i }));
    await user.click(analyzeButton());

    await waitFor(() => expect(analyzeDemoAction).toHaveBeenCalled());
    expect(analyzeDemoAction.mock.calls[0][0].turnstileToken).toBe("test-token");
  });

  it("sends the pasted job description instead of the sample", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(ok(analysis()));
    render(<DemoWorkspace siteKey={null} />);

    await user.type(screen.getByLabelText(/paste a job description/i), "Senior engineer wanted");
    await user.click(analyzeButton());

    await waitFor(() => expect(analyzeDemoAction).toHaveBeenCalled());
    expect(analyzeDemoAction.mock.calls[0][0].jobDescription).toBe("Senior engineer wanted");
  });
});

describe("no duplicate submission or provider calls", () => {
  it("invokes the action exactly once for a double click", async () => {
    const user = userEvent.setup();
    const gate = deferred<DemoActionResult<DemoAnalysisData>>();
    analyzeDemoAction.mockReturnValue(gate.promise);
    render(<DemoWorkspace siteKey={null} />);

    const button = analyzeButton();
    await user.click(button);
    // Second click while the first is open. The button is disabled and the ref
    // guard stands behind it; one invocation is one gateway.complete downstream.
    await user.click(button).catch(() => {});

    expect(analyzeDemoAction).toHaveBeenCalledTimes(1);

    gate.resolve(ok(analysis()));
    await waitFor(() => expect(screen.getByText("76")).toBeInTheDocument());
  });

  it("disables the button while a request is open", async () => {
    const user = userEvent.setup();
    const gate = deferred<DemoActionResult<DemoAnalysisData>>();
    analyzeDemoAction.mockReturnValue(gate.promise);
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    const busyButton = screen.getByRole("button", { name: /analyzing/i });
    expect(busyButton).toBeDisabled();
    expect(busyButton).toHaveAttribute("aria-busy", "true");

    gate.resolve(ok(analysis()));
    await waitFor(() => expect(analyzeButton()).toBeEnabled());
  });
});

describe("loading state", () => {
  it("announces progress while analyzing", async () => {
    const user = userEvent.setup();
    const gate = deferred<DemoActionResult<DemoAnalysisData>>();
    analyzeDemoAction.mockReturnValue(gate.promise);
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    expect(screen.getByText(/Analyzing…/i)).toBeInTheDocument();
    expect(screen.getByText(/Scoring on the server/i)).toBeInTheDocument();

    gate.resolve(ok(analysis()));
    await waitFor(() => expect(screen.getByText(/Analysis complete/i)).toBeInTheDocument());
  });
});

describe("deterministic success", () => {
  it("renders the score, the breakdown and both skill lists", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(ok(analysis()));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await waitFor(() => expect(screen.getByText("76")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /match score/i })).toBeInTheDocument();
    expect(screen.getByText(/Computed on the server/i)).toBeInTheDocument();

    const matched = screen.getByRole("heading", { name: /matched \(1\)/i }).parentElement!;
    expect(within(matched).getByText("React")).toBeInTheDocument();

    const missing = screen.getByRole("heading", { name: /missing \(1\)/i }).parentElement!;
    expect(within(missing).getByText("AWS")).toBeInTheDocument();
  });
});

describe("AI states", () => {
  it("renders insights when the review succeeded", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(ok(analysis({ aiInsights: INSIGHTS })));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await waitFor(() =>
      expect(screen.getByText(/Strong frontend match/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("Deep React background")).toBeInTheDocument();
    expect(screen.getByText(/claude-sonnet-5/)).toBeInTheDocument();
  });

  it("falls back gracefully when the review is unavailable", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(
      ok(analysis({ aiInsights: null, aiNote: "AI review is temporarily unavailable." })),
    );
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await waitFor(() =>
      expect(screen.getByText(/AI review is temporarily unavailable/i)).toBeInTheDocument(),
    );
    // The deterministic half is still fully rendered: this is the whole point.
    expect(screen.getByText("76")).toBeInTheDocument();
    expect(screen.getByText(/The score above is unaffected/i)).toBeInTheDocument();
  });

  it("shows the deterministic score when the budget is exhausted", async () => {
    const user = userEvent.setup();
    // Budget exhaustion is a successful response with no insights, never a
    // rejection — the T8 adjustment, verified from the UI's side.
    analyzeDemoAction.mockResolvedValue(
      ok(analysis({ aiInsights: null, aiNote: "AI review is temporarily unavailable." })),
    );
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await waitFor(() => expect(screen.getByText("76")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("gate failures render safe copy only", () => {
  const cases = [
    ["feature disabled", "demo_disabled", "The live demo is not available right now."],
    ["turnstile failure", "verification_failed", "We could not verify that request. Refresh the page and try again."],
    ["visitor rate limit", "rate_limited", "You have used all of this hour's analyses. Try again shortly."],
  ] as const;

  for (const [label, code, message] of cases) {
    it(`renders the server sentence for ${label}`, async () => {
      const user = userEvent.setup();
      analyzeDemoAction.mockResolvedValue(fail(code, message));
      render(<DemoWorkspace siteKey={null} />);

      await user.click(analyzeButton());

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(message);
      // Nothing from the machine room, in any failure.
      expect(document.body.textContent).not.toMatch(
        /supabase|postgres|anthropic|sk-ant|FEATURE_|DEMO_[A-Z]|Error:|stack trace|\bat .*\.tsx?:\d/i,
      );
    });
  }

  it("never renders a result alongside a failure", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(fail("rate_limited", "You have used all of this hour's analyses."));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: /match score/i })).not.toBeInTheDocument();
  });

  it("shows a generic sentence when the transport itself throws", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockRejectedValue(new Error("NetworkError at /Users/secret/app.js:1:1"));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong. Please try again.");
    expect(alert.textContent).not.toContain("/Users/");
    expect(alert.textContent).not.toContain("NetworkError");
  });
});

describe("validation errors", () => {
  it("surfaces a field error against the job description", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(
      fail("invalid_input", "Add a job description first.", {
        fieldErrors: { jobDescription: "Add a job description first." },
      }),
    );
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await waitFor(() =>
      expect(screen.getByLabelText(/paste a job description/i)).toHaveAttribute(
        "aria-invalid",
        "true",
      ),
    );
  });

  it("marks an over-long job description before submitting", async () => {
    const user = userEvent.setup();
    render(<DemoWorkspace siteKey={null} />);

    const box = screen.getByLabelText(/paste a job description/i);
    await user.click(box);
    // paste rather than type: 20k keystrokes is not a test, it is a hang.
    await user.paste("x".repeat(20_001));

    expect(box).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(/Too long by/i)).toBeInTheDocument();
  });
});

describe("upload flow", () => {
  const file = (name: string, type: string, size = 1024) => {
    const f = new File(["résumé"], name, { type });
    Object.defineProperty(f, "size", { value: size });
    return f;
  };

  it("parses in the browser and submits only the extracted text", async () => {
    const user = userEvent.setup();
    parseResume.mockResolvedValue({ text: "EXTRACTED RESUME TEXT", lines: [], sections: [] });
    analyzeDemoAction.mockResolvedValue(ok(analysis()));
    render(<DemoWorkspace siteKey={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file("jordan.pdf", "application/pdf"));

    await waitFor(() => expect(screen.getByText(/Ready: jordan.pdf/i)).toBeInTheDocument());

    await user.click(analyzeButton());
    await waitFor(() => expect(analyzeDemoAction).toHaveBeenCalled());
    expect(analyzeDemoAction.mock.calls[0][0].resumeText).toBe("EXTRACTED RESUME TEXT");
  });

  it("rejects a malformed upload without calling the server", async () => {
    const user = userEvent.setup();
    render(<DemoWorkspace siteKey={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file("virus.exe", "application/x-msdownload"));

    await waitFor(() =>
      expect(screen.getByText(/PDF|DOCX|not accepted|unsupported/i)).toBeInTheDocument(),
    );
    // Rejected before extraction: an unsupported file never reaches pdfjs.
    expect(parseResume).not.toHaveBeenCalled();
    expect(analyzeDemoAction).not.toHaveBeenCalled();
  });

  it("reports a parse failure without leaking library internals", async () => {
    const user = userEvent.setup();
    parseResume.mockRejectedValue(new Error("pdfjs: InvalidPDFException at worker.js:88"));
    render(<DemoWorkspace siteKey={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file("broken.pdf", "application/pdf"));

    await waitFor(() =>
      expect(screen.getByText(/could not be read/i)).toBeInTheDocument(),
    );
    expect(document.body.textContent).not.toContain("InvalidPDFException");
    expect(document.body.textContent).not.toContain("worker.js");
  });

  it("refuses a file over the demo ceiling", async () => {
    const user = userEvent.setup();
    render(<DemoWorkspace siteKey={null} />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file("huge.pdf", "application/pdf", 6 * 1024 * 1024));

    await waitFor(() => expect(screen.getByText(/under 5 MB/i)).toBeInTheDocument());
    expect(parseResume).not.toHaveBeenCalled();
  });
});

describe("retry", () => {
  it("recovers after a failure and clears the alert", async () => {
    const user = userEvent.setup();
    analyzeDemoAction
      .mockResolvedValueOnce(fail("rate_limited", "You have used all of this hour's analyses."))
      .mockResolvedValueOnce(ok(analysis()));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());
    await screen.findByRole("alert");
    // The label changes so a second attempt reads as a retry, not a repeat.
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();

    await user.click(analyzeButton());

    await waitFor(() => expect(screen.getByText("76")).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(analyzeDemoAction).toHaveBeenCalledTimes(2);
  });
});

describe("accessibility", () => {
  it("labels every control and exposes one live region per concern", () => {
    render(<DemoWorkspace siteKey={null} />);

    expect(screen.getByLabelText(/paste a job description/i)).toBeInTheDocument();
    expect(screen.getAllByRole("status").length).toBeGreaterThanOrEqual(2);
    for (const region of screen.getAllByRole("status")) {
      expect(region).toHaveAttribute("aria-live", "polite");
    }
  });

  it("gives the results a heading structure and moves focus to them", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(ok(analysis()));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    await waitFor(() => expect(screen.getByText("76")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: /match score/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ai review/i })).toBeInTheDocument();
    // A keyboard user lands on the answer rather than being left at the button.
    await waitFor(() => expect(document.activeElement).toHaveAttribute("tabindex", "-1"));
  });

  it("reports failures as an alert, not a passive status", async () => {
    const user = userEvent.setup();
    analyzeDemoAction.mockResolvedValue(fail("demo_disabled", "The live demo is not available right now."));
    render(<DemoWorkspace siteKey={null} />);

    await user.click(analyzeButton());

    // role="alert" is assertive: a failed submit should interrupt.
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });
});
