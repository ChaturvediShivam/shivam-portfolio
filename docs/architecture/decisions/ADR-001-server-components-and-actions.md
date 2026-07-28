# ADR-001: Next.js App Router — Server Components for reads, Server Actions for mutations

- **Status:** Accepted (implemented, v1.0.0)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [System Architecture](../SYSTEM_ARCHITECTURE.md) · [API Reference](../API_REFERENCE.md)

## Context
The CRM is an authenticated, data-heavy admin over Supabase. We needed a rendering
and data-mutation model that keeps secrets server-side, minimizes client JS, and
enforces authorization/validation consistently. The app already used the Next.js
14 App Router for the public marketing site.

## Decision
Use **React Server Components (RSC)** for all reads via `server-only` data layers
(`lib/<entity>.ts`), and **Next.js Server Actions** (wrapped by `withAdminAction`,
returning `ActionResult`) for all mutations. Client components (`"use client"`)
are used only where interactivity is required (forms, boards, pickers, overlays,
toolbars).

## Alternatives Considered
- **Client-side SPA + REST/`fetch`** (SWR/React Query): more client JS, tokens/keys
  risk, duplicated auth on every route.
- **REST route handlers for every mutation** (the older inquiry pattern): more
  boilerplate, manual serialization, no progressive enhancement.
- **tRPC / GraphQL:** heavier abstraction than a single-app admin needs.

## Pros
- Secrets never reach the client; data access is `server-only`.
- Less client JS; fast first render; streaming-ready.
- One consistent mutation contract (`ActionResult`) + centralized auth/validation.
- Co-located, type-safe actions; `revalidatePath` keeps caches correct.

## Cons
- Server Actions are Next-specific (framework lock-in).
- Discriminated-union narrowing across the action boundary needed care (see ADR-010).
- Streaming/interactive AI needs a client consumer of a server stream (a new boundary).

## Consequences
- Every module follows: RSC read → Server Action mutate → `ActionResult`.
- The pre-existing inquiry REST routes remain frozen rather than being rewritten.

## Future Impact
- Phase 3 AI chat introduces a **route handler** streaming to a client consumer —
  an intentional exception, not a reversal. The pattern otherwise scales to all
  new modules unchanged.
