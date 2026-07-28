# ADR-003: Event architecture — persisted audit log + domain-event bus

- **Status:** Accepted — `opportunity_events` implemented (v1.0.0); domain-event bus planned (Phase 3)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Events](../EVENTS.md) · [Phase 3 Architecture](../PHASE_3_ARCHITECTURE.md)

## Context
The CRM needs an auditable activity trail (timeline, dashboard feed) and, in
Phase 3, a way for mutations to drive automation, notifications, and AI jobs
without coupling producers to consumers.

## Decision
Adopt **two complementary layers**: (1) a **persisted append-only audit log**,
`opportunity_events`, carrying `actor_type ∈ {user, agent, system}` — the source
for the timeline/feed and AI/automation attribution; (2) a Phase-3 **application
domain-event bus** where `server-only` data layers emit typed events that are
enqueued as durable `jobs` and delivered **at-least-once** to consumers.
Opportunity-scoped domain events also persist an `opportunity_events` row.

## Alternatives Considered
- **No event log; recompute activity from row diffs:** lossy, no audit, hard for automation.
- **External event broker (Kafka/PubSub) now:** overkill for a single-tenant admin.
- **Synchronous in-request side effects only:** couples producers to consumers; fragile.

## Pros
- Durable audit + timeline out of the box; agent/human actions distinguishable.
- Decoupled producers/consumers; consumers are retryable and idempotent.
- Reuses the Postgres job queue — no new infrastructure.

## Cons
- Two layers to reason about (persisted vs transient).
- At-least-once delivery pushes idempotency onto every consumer.
- No strict global ordering guarantees.

## Consequences
- `lib/opportunities.ts` already writes events on create/stage/archive/note/link.
- Phase 3 data layers gain fire-and-forget `enqueue(event)` calls (additive).
- The event catalogue is documented in [EVENTS.md](../EVENTS.md).

## Future Impact
- Enables Automation (ADR-005 jobs) and AI subscribers; future outbound webhooks
  and real-time (Pub/Sub) fit the same envelope without redesign.
