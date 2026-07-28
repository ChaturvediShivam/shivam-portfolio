# ADR-010: Structured `ActionResult` + client-safe result module

- **Status:** Accepted (implemented, v1.0.0)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [API Reference](../API_REFERENCE.md#3-server-actions-api--current--the-crm-mutation-surface) · ADR-001

## Context
Server Actions (ADR-001) need a uniform way to return validation errors, business
errors, and success to client forms — and a client component must be able to
narrow the result without importing `server-only` code.

## Decision
Define `ActionResult<T> = { ok: true; data } | { ok: false; formError?; fieldErrors? }`
in a **non-`server-only`** module (`lib/action-result.ts`) alongside
`actionSuccess`/`actionError`/`isActionError`. The `server-only` `lib/actions.ts`
holds auth context (`getAdminActionContext`, `withAdminAction`) and re-exports the
types. Client forms use the **`isActionError` type guard** to narrow reliably
across the action boundary; errors map to `fieldErrors` (per-field) or `formError`
(banner/toast).

## Alternatives Considered
- **Throw exceptions from actions:** awkward to surface field-level errors in forms.
- **Return the failure type only:** loses the success payload typing.
- **Define `ActionResult` in the `server-only` module:** client can't import the guard
  (pulls server-only into the client bundle); observed discriminated-union narrowing
  failed across the boundary without an explicit guard.

## Pros
- One consistent, typed contract for every mutation.
- Client narrows failures safely without server-only imports.
- Clean separation: result types (shared) vs auth context (server-only).

## Cons
- A small extra module + guard indirection.
- Developers must remember to route errors to `fieldErrors` vs `formError`.

## Consequences
- Every module's actions return `ActionResult`; forms use `isActionError`.
- Validation lives in a dependency-free `lib/validation` schema helper.

## Future Impact
- Phase 3 actions (drafting/approval/automation) reuse the identical contract;
  no per-feature error protocol.
