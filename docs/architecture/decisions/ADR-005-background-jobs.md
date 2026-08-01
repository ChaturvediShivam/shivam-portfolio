# ADR-005: Background jobs — Postgres-backed queue drained on a schedule

- **Status:** Accepted (planned — Phase 3, M1)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Phase 3 Architecture](../PHASE_3_ARCHITECTURE.md#15-background-job-strategy) · [Runbook · Jobs/Cron/Queue](../../operations/RUNBOOK.md)

## Context
Phase 3 needs durable async work — Gmail/Calendar sync, AI summaries/embeddings,
notification dispatch, automation runs — that survives crashes, retries safely,
and stays within Vercel's serverless execution limits. There is no always-on
worker process.

## Decision
Implement a **durable job queue in Postgres** (a `jobs` table) drained by **Vercel
Cron** hitting a secret-authenticated `POST /api/jobs/run`. Workers claim a bounded
batch with `SELECT … FOR UPDATE SKIP LOCKED`, dispatch by `type` to idempotent
handlers, and complete/fail with exponential backoff and a dead-letter state. Long
work is chunked into follow-up jobs. The `lib/jobs` interface abstracts the backend
so it can be swapped later.

## Alternatives Considered
- **Inngest / Vercel Queues / WDK:** great durability/DX but a new dependency + infra now.
- **Upstash QStash:** HTTP queue, external dependency/cost.
- **Supabase pg_cron + Edge Functions:** viable, but splits logic across runtimes.
- **Do work inline in requests:** blocks users, hits timeouts, no retries.

## Pros
- No new infrastructure or dependency; reuses Supabase.
- Transactional with domain writes; backed up with the database.
- Simple mental model; idempotent + `SKIP LOCKED` avoids double-processing.

## Cons
- Not sub-second/real-time; cron-cadence latency.
- Throughput bounded by cron frequency + function limits.
- Requires careful chunking for long jobs.

## Consequences
- New `jobs` table (additive); scheduled drainer (`.github/workflows/drain-jobs.yml`); `CRON_SECRET` in Vercel **and** GitHub secrets.
- All handlers must be idempotent; dead-letter surfaced in Settings.

## Future Impact
- If automation/throughput outgrows this, swap the backend for Inngest/WDK behind
  the same `lib/jobs` interface — handlers unchanged.
