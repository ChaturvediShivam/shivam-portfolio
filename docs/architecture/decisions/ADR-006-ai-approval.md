# ADR-006: AI/automation human-in-the-loop approval gating

- **Status:** Accepted (planned — Phase 3, M6/M9/M10)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [AI Architecture](../../ai/AI_ARCHITECTURE.md#human-approval-workflow) · [Phase 3 Architecture](../PHASE_3_ARCHITECTURE.md#13-ai-request-flow)

## Context
Phase 3 lets AI and automation *act* — draft/send email, change stage, create
calendar events. Wrong or premature actions on real relationships and a real
inbox are high-impact and hard to undo. Trust must be earned before autonomy.

## Decision
Make **every external or high-impact AI/automation action approval-gated**. Agents
and rules *propose* actions, stored in `ai_approvals` (with rationale + confidence);
nothing outbound (send email, advance stage, create event) executes without an
explicit human `approval_granted`. Read-only tools and low-risk drafts run without
approval. All actions are audited (`ai_audit_log`, `opportunity_events`
`actor_type='agent'`, `automation_runs`).

## Alternatives Considered
- **Fully autonomous agents:** fastest, but unacceptable trust/error/reputational risk.
- **No AI actions (read/summarize only):** safe but forgoes the core value.
- **Post-hoc undo instead of pre-approval:** many actions (sent email) are irreversible.

## Pros
- Prevents irreversible mistakes; keeps a human accountable.
- Full audit trail; explainable proposals.
- Lets autonomy be granted incrementally as evals justify it.

## Cons
- Adds a human step (friction) to every consequential action.
- Requires an approvals queue UI + workflow.
- Slower than full automation.

## Consequences
- `ai_approvals` table; approvals UI; send/execute keyed on `approval_id` (idempotent).
- Tools are consequence-classed (`read`/`write`/`external`).

## Future Impact
- Specific low-risk actions can later graduate past approval once eval data
  supports it — the gate is a policy, not a hard wall.
