# Architecture Decision Records (ADRs)

Records of the **major architectural decisions** for the Career CRM — the
context, the choice, the alternatives, and the consequences. ADRs are immutable
history: to change a decision, add a new ADR that supersedes the old one (don't
rewrite it).

**Related:** [System Architecture](../SYSTEM_ARCHITECTURE.md) ·
[Phase 3 Architecture](../PHASE_3_ARCHITECTURE.md) ·
[Database Guide](../../database/DATABASE_GUIDE.md) ·
[Events](../EVENTS.md) · [API Reference](../API_REFERENCE.md) ·
[Runbook](../../operations/RUNBOOK.md)

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](./ADR-001-server-components-and-actions.md) | App Router — Server Components (reads) + Server Actions (mutations) | Accepted · implemented |
| [ADR-002](./ADR-002-supabase-backend.md) | Supabase (Postgres + Auth + RLS) as the backend platform | Accepted · implemented |
| [ADR-003](./ADR-003-event-architecture.md) | Event architecture — persisted audit log + domain-event bus | Accepted · partial (P3 bus planned) |
| [ADR-004](./ADR-004-oauth.md) | Google OAuth with PKCE + encrypted token storage | Accepted · planned (P3) |
| [ADR-005](./ADR-005-background-jobs.md) | Background jobs — Postgres queue + Vercel Cron | Accepted · planned (P3) |
| [ADR-006](./ADR-006-ai-approval.md) | AI/automation human-in-the-loop approval gating | Accepted · planned (P3) |
| [ADR-007](./ADR-007-provider-abstraction.md) | Provider abstraction (adapter contract) for integrations | Accepted · planned (P3) |
| [ADR-008](./ADR-008-additive-schema-and-rls.md) | Additive-only schema evolution + single-admin RLS | Accepted · implemented |
| [ADR-009](./ADR-009-feature-flagged-milestones.md) | Feature-flagged, independently-deployable milestones | Accepted · implemented |
| [ADR-010](./ADR-010-action-result-pattern.md) | Structured `ActionResult` + client-safe result module | Accepted · implemented |
| [ADR-011](./ADR-011-html-sanitization.md) | Server-side HTML sanitization for message rendering | Accepted · implemented |
| [ADR-012](./ADR-012-accessible-drag-and-drop.md) | Native drag-and-drop with an accessible fallback | Accepted · implemented |

## Format

Every ADR uses the same headings:

- **Status** (Accepted · Superseded · Deprecated · Proposed) · **Date** · **Deciders** · **Related**
- **Context** — the forces and constraints
- **Decision** — what was chosen
- **Alternatives Considered**
- **Pros**
- **Cons**
- **Consequences** — what follows from the decision
- **Future Impact** — how it shapes later phases

## Conventions

- One decision per file, numbered sequentially (`ADR-NNN-title.md`).
- Never edit an accepted ADR's decision; supersede it with a new ADR and update
  the older one's Status to `Superseded by ADR-NNN`.
- Keep ADRs short and focused; link out to the architecture/design docs for detail.

---

- **Owner:** Repository maintainer (Shivam Chaturvedi)
- **Last Updated:** 2026-07-28
- **Baseline:** v1.0.0 (`c2b5dc3`) — implemented decisions reflect this release;
  planned (P3) decisions are the approved Phase 3 design.
