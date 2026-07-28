# ADR-012: Native drag-and-drop with a keyboard-accessible fallback (no DnD dependency)

- **Status:** Accepted (implemented, v1.0.0 — Opportunities/Tasks boards)
- **Date:** 2026-07-28
- **Deciders:** Repository maintainer
- **Related:** [Design System](../../design/DESIGN_SYSTEM.md) · [Component Library](../../design/COMPONENT_LIBRARY.md)

## Context
The Opportunities pipeline and Tasks boards need drag-and-drop to move cards
between stages/statuses, and the requirement mandated **keyboard accessibility**.
The project avoids unapproved dependencies.

## Decision
Implement **native HTML5 drag-and-drop** for pointer users, plus a **per-card
`<select>`** as the accessible alternative (a documented WAI-ARIA pattern: always
provide a non-drag path). Both paths call the same `changeStage`/`changeStatus`
action with **optimistic update + rollback on failure**. No drag-and-drop library
was added.

## Alternatives Considered
- **`dnd-kit` / `react-beautiful-dnd`:** best pointer + built-in keyboard DnD, but a
  new dependency and a heavier client bundle.
- **Native DnD only:** no touch support and poor keyboard accessibility (fails the requirement).
- **Buttons/menu only (no drag):** accessible but a weaker desktop UX.

## Pros
- Zero dependency; small bundle.
- Fully keyboard-operable via the select (accessible by construction).
- Optimistic UX with safe rollback; one action powers both paths.

## Cons
- Native DnD has **no touch-drag** (mobile uses the select — which is the a11y path anyway).
- No cross-column reordering / position persistence (stage/status change only).
- Slightly more manual than a library's built-in interactions.

## Consequences
- `PipelineBoard`/`TaskBoard` implement native DnD + card `<select>` + optimistic state.
- Documented as the standard board interaction in the design docs.

## Future Impact
- If richer DnD (touch, reordering) is needed, adopt `dnd-kit` behind the same
  board components — the action + optimistic model stays; the select remains as
  the accessible fallback.
