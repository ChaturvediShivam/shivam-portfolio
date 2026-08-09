"use client";

import * as React from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { analyzeDemoAction } from "@/app/(marketing)/demo/actions";
import type { DemoAnalysisData } from "@/lib/demo/analysis";
import { DemoResumeInput } from "@/components/demo/DemoResumeInput";
import { DemoJdInput } from "@/components/demo/DemoJdInput";
import { DemoResults } from "@/components/demo/DemoResults";

/**
 * The demo's interactive shell.
 *
 * Holds the two inputs, one submit, and the result. It composes the existing
 * server action and adds no analysis of its own — there is no scoring, no
 * parsing decision and no policy here, because all three already exist behind
 * the action and a second copy in the browser would be a second answer.
 *
 * ONE INVOCATION, ENFORCED TWICE
 *
 * The button disables while a request is open, which handles the honest case. A
 * ref guard sits behind it for the dishonest one: a double-fire from a fast
 * double-click, an Enter keypress landing between render and paint, or a test
 * doing both. State updates are asynchronous and cannot be relied on to have
 * landed by the time a second click arrives; the ref is synchronous and can.
 */

type Phase = "idle" | "analyzing" | "done" | "error";

interface Failure {
  message: string;
  fieldErrors?: Record<string, string>;
}

export function DemoWorkspace({ siteKey }: { siteKey: string | null }) {
  const [resume, setResume] = React.useState<{ text: string | null; label: string }>({
    text: null,
    label: "Sample resume",
  });
  const [jobDescription, setJobDescription] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [result, setResult] = React.useState<DemoAnalysisData | null>(null);
  const [failure, setFailure] = React.useState<Failure | null>(null);

  const inFlight = React.useRef(false);
  const turnstileRef = React.useRef<TurnstileInstance>(null);
  const resultsRef = React.useRef<HTMLDivElement>(null);

  const busy = phase === "analyzing";

  const analyze = React.useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;

    setPhase("analyzing");
    setFailure(null);

    try {
      const response = await analyzeDemoAction({
        // Only text crosses the wire. The server re-derives every structure it
        // needs, so nothing computed in this browser is trusted.
        resumeText: resume.text,
        jobDescription,
        turnstileToken: token,
      });

      if (response.ok === false) {
        // `formError` is already scrubbed server-side — it is the only string
        // from a failure this component is permitted to render.
        setResult(null);
        setFailure({ message: response.formError, fieldErrors: response.fieldErrors });
        setPhase("error");
      } else {
        setResult(response.data);
        setPhase("done");
      }
    } catch {
      // A transport failure, not an application one. Nothing to report but the
      // fact of it: an exception here could carry a stack.
      setResult(null);
      setFailure({ message: "Something went wrong. Please try again." });
      setPhase("error");
    } finally {
      inFlight.current = false;
      // Turnstile tokens are single-use, so a retry needs a fresh one. Reset
      // whatever the outcome, or the second attempt fails verification.
      turnstileRef.current?.reset();
      setToken(null);
    }
  }, [resume.text, jobDescription, token]);

  // Move focus to the results once they exist, so a keyboard or screen-reader
  // user lands on the answer instead of being left at the button.
  React.useEffect(() => {
    if (phase === "done") resultsRef.current?.focus();
  }, [phase]);

  return (
    <div className="mt-10">
      <div className="grid gap-8 md:grid-cols-2">
        <DemoResumeInput
          value={resume.text}
          label={resume.label}
          disabled={busy}
          onChange={setResume}
        />
        <DemoJdInput
          value={jobDescription}
          disabled={busy}
          error={failure?.fieldErrors?.jobDescription}
          onChange={setJobDescription}
        />
      </div>

      {siteKey && (
        <div className="mt-8">
          <Turnstile
            ref={turnstileRef}
            siteKey={siteKey}
            onSuccess={setToken}
            onError={() => setToken(null)}
            onExpire={() => setToken(null)}
            options={{ theme: "auto", size: "normal" }}
          />
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-4">
        <button
          type="button"
          onClick={analyze}
          disabled={busy}
          aria-busy={busy}
          className="rounded-lg bg-consulting-royal px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Analyzing…" : phase === "error" ? "Try again" : "Analyze resume"}
        </button>

        {/* The single status region for the submit itself. Polite, so it does
            not interrupt a screen reader mid-sentence on every state change. */}
        <p
          role="status"
          aria-live="polite"
          className="text-xs text-consulting-slate dark:text-slate-400"
        >
          {busy
            ? "Scoring on the server, then asking the model…"
            : phase === "done"
              ? "Analysis complete."
              : ""}
        </p>
      </div>

      {phase === "error" && failure && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200"
        >
          {failure.message}
        </p>
      )}

      {result && <DemoResults ref={resultsRef} data={result} />}
    </div>
  );
}
