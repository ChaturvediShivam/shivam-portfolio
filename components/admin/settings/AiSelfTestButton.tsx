"use client";

import * as React from "react";
import { isActionError } from "@/lib/action-result";
import { runAiSelfTestAction, type AiSelfTestResult } from "@/app/admin/(dashboard)/settings/actions";

/**
 * AI self-test trigger (Phase 3 · M6).
 *
 * Takes no input — it runs a fixed in-repo template with a server-generated
 * nonce. Reports provider, model, tokens and latency so the operator can verify
 * the whole path during rollout.
 */
export function AiSelfTestButton() {
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<AiSelfTestResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    setResult(null);

    const response = await runAiSelfTestAction();
    if (isActionError(response)) {
      setError(response.formError ?? "Self-test failed.");
    } else {
      setResult(response.data);
    }
    setPending(false);
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Running…" : "Run self-test"}
      </button>

      {result && (
        <p className="text-xs text-slate-400">
          {result.echoed ? "Passed" : "Responded, nonce mismatch"} · {result.provider}/{result.model} ·{" "}
          {result.tokens} tokens · {result.latencyMs} ms
        </p>
      )}

      {error && <p className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
