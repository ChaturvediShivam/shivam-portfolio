# ADR-007: Provider abstraction (adapter contract) for integrations

- **Status:** Accepted (planned — Phase 3; schema foundation in v1.0.0)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Phase 3 Architecture](../PHASE_3_ARCHITECTURE.md#23-future-expansion) · [Database Guide](../../database/DATABASE_GUIDE.md)

## Context
The CRM must ingest from many external sources over time — Gmail first, then
LinkedIn, Wellfound, Greenhouse, Lever, Ashby, Workday, Indeed, and company
portals. Coupling code to Gmail specifics would force a rewrite per provider.

## Decision
Model integrations behind a **common `ProviderAdapter` contract** (`lib/integrations/<provider>/`)
and a **source-agnostic data model**: rows carry `source` (enum), an
`integration_account_id` (which account), typed `external_*_id`, and an
`external_ids jsonb` map for cross-provider identity. `messages` and
`integration_accounts` are already source-agnostic (Phase 1). New providers add an
adapter + enum value — **no schema redesign**.

## Alternatives Considered
- **Gmail-specific code paths:** fastest for one provider, expensive for the next.
- **Generic sync engine with no typed columns:** loses queryability/dedupe guarantees.
- **Per-provider tables:** duplication; hard to unify inbox/analytics.

## Pros
- New providers are additive (adapter + enum), not redesigns.
- Unified inbox, dedupe, and analytics across sources.
- `external_ids` enables cross-source identity resolution.

## Cons
- An abstraction to maintain; leaky where providers differ significantly.
- Upfront generality before the second provider exists (some YAGNI risk — mitigated
  by the schema already supporting it at near-zero cost).

## Consequences
- `integration_provider` enum + `external_ids` GIN indexes already in place.
- Gmail (M2/M3) is the first adapter implementing the contract.

## Future Impact
- LinkedIn/ATS providers slot in via the same contract and `source`/`external_ids`;
  real-time push (Pub/Sub) swaps the transport without touching the model.
