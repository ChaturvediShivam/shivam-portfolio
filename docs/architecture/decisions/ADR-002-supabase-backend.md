# ADR-002: Supabase (Postgres + Auth + RLS) as the backend platform

- **Status:** Accepted (implemented, v1.0.0)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Database Guide](../../database/DATABASE_GUIDE.md) · [System Architecture](../SYSTEM_ARCHITECTURE.md)

## Context
The product needs a relational database, authentication, and row-level
authorization, deployed alongside a Vercel-hosted Next.js app, with low ops
overhead for a single maintainer. The Phase-0 inquiry system already ran on
Supabase.

## Decision
Use **Supabase** as the single backend: **Postgres** (system of record),
**Supabase Auth** (email/password sessions via `@supabase/ssr`), and **Row Level
Security** as the authorization boundary. Three client flavors: browser (anon,
RLS-bound), server (SSR, session-bound), and service-role (server-only,
RLS-bypassing, used only by the public contact intake).

## Alternatives Considered
- **Custom Postgres + hand-rolled auth:** more control, far more ops + security surface.
- **Firebase/other BaaS:** document model less suited to the relational CRM; weaker SQL/RLS.
- **Separate auth provider (Clerk/Auth0) + own DB:** extra integration; RLS harder.

## Pros
- Postgres power (FTS, `jsonb`, generated columns, pgvector) + managed ops.
- RLS provides defense-in-depth authorization at the data layer.
- Auth, DB, and (future) Vault/pgsodium in one platform.
- SQL migrations are portable and versionable.

## Cons
- Vendor coupling to Supabase specifics.
- RLS + service-role require discipline to use correctly (service role bypasses RLS).
- Migrations applied out-of-band (not by Vercel) — a manual step.

## Consequences
- Every table enables RLS with an `"Authenticated admin full access"` policy (ADR-008).
- Service-role usage is confined to the public contact route; never in the admin path.
- Migrations live in `supabase/migrations/`, additive + idempotent.

## Future Impact
- Phase 3 leans on Supabase for encrypted token storage (Vault/pgsodium), pgvector
  retrieval, and the Postgres-backed job queue (ADR-005) — no new datastore needed.
