# ADR-009: Feature-flagged, independently-deployable milestones

- **Status:** Accepted (implemented across Phase 2; standard for Phase 3)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Phase 3 Implementation Guide](../PHASE_3_IMPLEMENTATION_GUIDE.md) · [Runbook · Rollback](../../operations/RUNBOOK.md)

## Context
The CRM is delivered continuously to production by a single maintainer. Large
features must land safely without long-lived branches, and any change must be
reversible quickly.

## Decision
Ship each capability as a **small, additive, independently deployable milestone**
that goes to production **dark** (behind a flag / disabled nav item), is verified,
then enabled. In Phase 2 this used the sidebar `enabled` toggle + placeholder
routes; in Phase 3 it is an env-var feature flag per milestone. Every milestone
ends on the same gate: **Lint → Typecheck → Build → Smoke → Regression → Deploy**.

## Alternatives Considered
- **Big-bang phase releases:** high blast radius, hard rollback, long review.
- **Long-lived feature branches:** merge pain, drift from `main`.
- **Trunk-based with no flags:** unfinished work visible/active in production.

## Pros
- Rollback = flip a flag (no redeploy); tiny blast radius per change.
- `main` always deployable; `v1.0.0` always a valid rollback point.
- Continuous verification; each slice independently testable.

## Cons
- Flag/branch bookkeeping and cleanup overhead.
- Temporary dead/dark code in production until enablement.
- Requires discipline to keep milestones truly additive.

## Consequences
- Nav config (`lib/admin/navigation.ts`) is the per-milestone integration point.
- Phase 3 defines one flag per milestone (`FEATURE_*`), default off in prod.

## Future Impact
- Enables safe rollout of risky Phase 3 features (AI, automation) and gradual
  autonomy (ADR-006) with instant kill switches.
