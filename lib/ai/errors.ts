import "server-only";

/**
 * AI error taxonomy (Phase 3 · M6).
 *
 * Provider-neutral by construction: adapters classify their own SDK/HTTP errors
 * into exactly these types, so no vendor error class escapes the adapter and the
 * job runner's retry policy stays provider-independent.
 *
 * Retry contract (M1 runner): a thrown `AiTransientError` is worth retrying
 * under exponential backoff; every other error here is permanent and should
 * dead-letter immediately rather than burn the attempt budget.
 */

export type AiErrorCode =
  | "disabled"
  | "unconfigured"
  | "transient"
  | "permanent"
  | "budget_exceeded"
  | "approval_required"
  | "invalid_output"
  | "unknown_template"
  | "unknown_tool";

/** Base class so callers can catch every gateway error in one clause. */
export class AiError extends Error {
  readonly code: AiErrorCode;
  /** True when retrying the identical request could succeed. */
  readonly retryable: boolean;

  constructor(code: AiErrorCode, message: string, retryable: boolean) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.retryable = retryable;
  }
}

/** The feature flag is off. Fully inert — nothing was called. */
export class AiDisabledError extends AiError {
  constructor(message = "AI is not enabled.") {
    super("disabled", message, false);
  }
}

/** No provider credentials / provider not selected. Fail-closed. */
export class AiUnconfiguredError extends AiError {
  constructor(message = "AI provider is not configured.") {
    super("unconfigured", message, false);
  }
}

/** Rate limit, timeout, connection failure, provider 5xx. Retry with backoff. */
export class AiTransientError extends AiError {
  constructor(message: string) {
    super("transient", message, true);
  }
}

/** Bad request, auth failure, unknown model. Retrying cannot help. */
export class AiPermanentError extends AiError {
  constructor(message: string) {
    super("permanent", message, false);
  }
}

/** The owner's daily token budget is exhausted. Permanent for the day. */
export class AiBudgetExceededError extends AiError {
  constructor(message = "Daily AI token budget exhausted.") {
    super("budget_exceeded", message, false);
  }
}

/**
 * A `write` or `external` tool was requested. M6 registers no such tools and has
 * no approval queue (that is M9), so the only correct answer is to refuse.
 */
export class AiApprovalRequiredError extends AiError {
  constructor(toolName: string) {
    super("approval_required", `Tool "${toolName}" requires approval and cannot execute.`, false);
  }
}

/** Structured output failed schema validation. */
export class AiInvalidOutputError extends AiError {
  constructor(message: string) {
    super("invalid_output", message, false);
  }
}

/** Prompt template id/version not found. Raised before any provider call. */
export class AiUnknownTemplateError extends AiError {
  constructor(id: string, version?: string) {
    super("unknown_template", `Unknown prompt template "${id}"${version ? `@${version}` : ""}.`, false);
  }
}

/** The model asked for a tool that is not in the registry. */
export class AiUnknownToolError extends AiError {
  constructor(name: string) {
    super("unknown_tool", `Unknown tool "${name}".`, false);
  }
}

/** Stable code for audit rows; "error" for anything not from this taxonomy. */
export function aiErrorCode(error: unknown): string {
  return error instanceof AiError ? error.code : "error";
}
