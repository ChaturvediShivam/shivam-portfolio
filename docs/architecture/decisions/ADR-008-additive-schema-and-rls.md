# ADR-008: Additive-only schema evolution + single-admin RLS

- **Status:** Accepted (implemented, v1.0.0)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Database Guide](../../database/DATABASE_GUIDE.md) · [Phase 1 Completion](../../roadmap/PHASE_1_COMPLETION.md)

## Context
The CRM was built on top of a live inquiry system and evolves across many phases.
Schema changes on a production database with real data are risky; and the product
is single-operator today but must be multi-user-ready later.

## Decision
Adopt **additive-only, idempotent migrations** (guarded `create … if not exists`,
`do`-blocked enums, `drop … if exists` before triggers/policies) — never
`ALTER`/`DROP` existing tables. Every table enables **RLS** with one policy,
`"Authenticated admin full access"` (`auth.role() = 'authenticated'`), and carries
a nullable **`owner_id → auth.users`** so per-user isolation is a later policy
change, not a data migration. Native enums for closed sets; `text` for volatile
ones; generated `tsvector` FTS.

## Alternatives Considered
- **Mutable/destructive migrations:** simpler diffs, but high production risk + no easy rollback.
- **Per-user RLS from day one:** premature for single-admin; adds complexity with no user directory.
- **App-layer authorization only (no RLS):** weaker; a bug bypasses all checks.

## Pros
- Migrations are safe to re-run and reversible-by-roll-forward; v1.0.0 stays a valid baseline.
- RLS is defense-in-depth; anon key can never read/write.
- `owner_id` future-proofs multi-user with no redesign.

## Cons
- `owner_id`-scoped unique constraints are dormant while `owner_id` is null.
- Additive discipline can accumulate unused columns/tables over time.
- Coarse single-admin policy (any authenticated user = full access) until Phase 5
  (Production Hardening).

## Consequences
- Every Phase 2/3 table follows the convention; migrations applied out-of-band.
- Rollback strategy favors roll-forward; destructive teardown is a separate explicit migration.

## Future Impact
- Multi-user (Phase 5 · Production Hardening) tightens policies to
  `owner_id = auth.uid()` — a migration, not a redesign; the AI/integration tables
  inherit the same posture.
