# Design System

The complete UI system for the Career CRM admin surface — minimal,
enterprise-grade, Linear/Vercel-inspired: a dark, low-chroma canvas where content
and data lead and chrome recedes. This document defines the tokens and standards;
the [Component Library](./COMPONENT_LIBRARY.md) documents each component's API.

**Related:** [Component Library](./COMPONENT_LIBRARY.md) · [README](../../README.md) ·
[System Architecture](../architecture/SYSTEM_ARCHITECTURE.md) ·
[ADR-012 accessible drag-and-drop](../architecture/decisions/ADR-012-accessible-drag-and-drop.md)

> **Two surfaces.** The **marketing** site uses the `consulting` palette
> (navy/royal, light-first, theme-aware). This document governs the **admin / CRM**
> surface — dark, slate + white-alpha — implemented in `components/admin/ui/*` and
> used across `app/admin`. Values below are the tokens **already in use**; extend
> them, don't reinvent them.

**Where components live:** the admin kit is `components/admin/ui/` (barrel:
`@/components/admin/ui`); shared class-merge is `lib/utils.ts` (`cn`). The
marketing kit (`components/ui/`) is separate and light-themed.

---

## Design Principles

1. **Content first, chrome last** — near-black surfaces, barely-there white-alpha borders; ink creates hierarchy.
2. **Calm and quiet** — low chroma, restrained motion, generous-not-loose spacing.
3. **One unit of everything** — a single type scale, spacing step, radius set, and easing curve, reused everywhere.
4. **Legible density** — default `text-sm`, tight rhythm, scannable tables.
5. **State is explicit** — every surface has empty, loading, and error states.
6. **Accessible by default** — contrast, focus-visible rings, keyboard paths.

---

## Typography

System/Inter stack. Weights: `font-medium` (500) for emphasis, `font-semibold`
(600) for headings — avoid bold-700 in-app.

| Token | Class | Size | Use |
|-------|-------|------|-----|
| Display | `text-xl` | 20px | Page titles (`PageHeader` `<h1>`) |
| Heading | `text-lg` | 18px | Section headings, drawer/dialog titles |
| Body | `text-sm` | 14px | **Default** — body, table cells, inputs, nav |
| Caption | `text-xs` | 12px | Metadata, badges, helper/error text, table headers |
| Stat value | `text-2xl font-semibold` | 24px | `StatCard` numbers |

Text colour ramp (on `#0B0E14`): heading `text-white` · primary `text-slate-200` ·
secondary `text-slate-400` · muted/meta `text-slate-500` · disabled/dash
`text-slate-600`. Numeric columns use `tabular-nums`.

---

## Spacing

4px base (Tailwind default scale).

| Context | Classes |
|---------|---------|
| Page padding | `p-6 md:p-10` |
| Card / panel padding | `p-4` (compact) · `p-5` (default) · `p-6` (roomy) |
| Nav item | `px-3 py-2` · Badge | `px-2 py-0.5` |
| Stack (tight) | `space-y-0.5`–`space-y-1` · (content) `space-y-6`–`space-y-8` |
| Inline gap | `gap-2` (icon+label) · `gap-3` |
| Content width | list `max-w-7xl mx-auto` · detail `max-w-4xl`/`max-w-6xl` · form `max-w-3xl` · board `max-w-none` |

Section rhythm: top-level page sections separated by `space-y-6` (dense) /
`space-y-8` (dashboard).

---

## Radius

| Token | Class | Use |
|-------|-------|-----|
| Default | `rounded-md` (6px) | Buttons, inputs, nav items, most surfaces |
| Card | `rounded-lg` (8px) | Cards, panels, drawers, dialogs |
| Pill | `rounded-full` | Badges, avatars, status dots, toggles |

## Elevation / Shadow

The dark surface leans on **borders + background layering**, not heavy shadows.

| Level | Approach |
|-------|----------|
| Flat | `border border-white/[0.06]` |
| Raised | `bg-white/[0.03]` (cards, row hover) |
| Elevated/active | `bg-white/[0.06]` + `border-white/10` |
| Overlay | `bg-[#0B0E14]` + `border-white/10` + `shadow-2xl shadow-black/40`, scrim `bg-black/60 backdrop-blur-sm` |

---

## Buttons

Component: **`Button`** / `buttonClasses` (`components/admin/ui/Button.tsx`).
Base: `inline-flex items-center justify-center gap-2 rounded-md font-medium
focus-visible:ring-2 ring-white/20 disabled:opacity-50`.

| Variant | Style | Use |
|---------|-------|-----|
| `primary` | `bg-white text-slate-900 hover:bg-slate-200` | The single main action per view |
| `secondary` | `bg-white/[0.06] text-slate-200 border border-white/10 hover:bg-white/[0.1]` | Supporting actions |
| `ghost` | `text-slate-400 hover:text-white hover:bg-white/[0.06]` | Toolbar/inline (matches sidebar & sign-out) |
| `danger` | `text-red-400 border border-red-500/20 hover:bg-red-500/10` | Destructive; always via `ConfirmDialog` |
| `icon` | ghost + `size-8`, centered lucide icon | Compact icon-only actions |

- **Sizes:** `sm` (`text-xs px-2.5 py-1.5`) · `md` (`text-sm px-3 py-2`, default).
- **Loading:** `isLoading` swaps in a spinner and disables; width stays stable.
- **Links styled as buttons:** use `buttonClasses(variant, size)` on `<Link>`.
- **Icon sizing in buttons:** lucide `size-4`; spacing via base `gap-2`.

---

## Cards

There is **no generic `Card` component** in the admin kit by design — cards are a
**composition convention** (keeps markup honest and flexible). The canonical panel:

```
rounded-lg border border-white/[0.06] bg-white/[0.02] p-5
```

- Section header inside a card: `text-sm font-semibold text-white`, optional
  `text-xs text-slate-500` description; content separated by
  `border-t border-white/[0.06] pt-5` when needed.
- **Metric tiles:** `StatCard` (`components/admin/dashboard/StatCard.tsx`) — label
  (`text-xs text-slate-500`) + value (`text-2xl font-semibold`), link-aware,
  `alert` variant turns the value red.
- Hover for interactive cards: `hover:border-white/15 hover:bg-white/[0.03]`.

---

## Badges

Component: **`Badge`** (`components/admin/ui/Badge.tsx`). Base:
`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium
border` + a hue triplet `bg-{hue}-500/10 text-{hue}-400 border-{hue}-500/20`.
Optional leading `dot`.

| Variant | Hue | Meaning |
|---------|-----|---------|
| `info` | blue | new / informational |
| `progress` | amber | in progress / pending |
| `special` | purple | offer / flagged |
| `success` | emerald | won / hired / positive |
| `neutral` | slate | closed / archived / default |
| `danger` | red | rejected / error / overdue |

**Domain mappings** (helpers in `types/*`): opportunity `stageBadgeVariant`, task
`statusBadgeVariant`/`priorityBadgeVariant`, message `directionBadgeVariant`,
inquiry `StatusBadge`. See [Component Library → StatusBadge](./COMPONENT_LIBRARY.md).

---

## Tables

Component: **`DataTable`** (`components/admin/ui/DataTable.tsx`) — generic, typed
columns, server-friendly (sort/row-links are plain anchors).

- Header: `text-xs text-slate-500` uppercase; sortable headers are links with
  `aria-sort` + caret.
- Body: `text-sm text-slate-200`; row separators `divide`/`border-white/[0.06]`;
  hover `hover:bg-white/[0.03]`; **keyboard focus** `focus-within:bg-white/[0.05]`
  on the row.
- Cell padding `px-4 py-3`; numeric right-aligned + `tabular-nums`; first column
  is the identity link (stretched link for whole-row navigation via `rowHref`).
- Wrapped in `overflow-x-auto rounded-lg border` — wide tables scroll inside, never
  break the page. Pairs with `FilterBar` (top) + `Pagination` (bottom); empty →
  `EmptyState`, loading → skeleton rows.

---

## Dialogs

Components: **`Dialog`** + **`ConfirmDialog`** (`components/admin/ui/Dialog.tsx`,
`ConfirmDialog.tsx`). Centered modal for short, focused, blocking tasks.

- Panel: `max-w-sm`/`max-w-md`, `rounded-lg border border-white/10 bg-[#0B0E14]
  shadow-2xl`; scrim `bg-black/60 backdrop-blur-sm`.
- Header title + optional description + close (unless `hideClose`); sticky footer
  actions (right-aligned).
- **`ConfirmDialog`**: title, description, cancel (ghost) + confirm
  (primary/`danger`); `isPending` for async; **focus defaults to the safe action**.
- **A11y:** `role="dialog" aria-modal`, focus trap, `Esc` closes, scrim click
  closes, focus restore, labelled by title (`useOverlay` hook).

Prefer **Drawers** for forms; **Dialogs** for confirmations/short tasks.

---

## Forms

Components: **`FormField`**, **`TextInput`**, **`Textarea`**, **`Select`**,
**`EntityPicker`** (`components/admin/ui/*`). Search: **`SearchInput`**.

- **`FormField`** wraps label + control + hint/error and **auto-wires a11y**
  (injects `id`, `aria-invalid`, `aria-describedby` into the child).
- Inputs: `bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm`,
  `focus-visible:ring-2 ring-white/20 focus:border-white/20`, invalid →
  `border-red-500/40`.
- Labels `text-sm text-slate-300`; required marked `*`; hints/errors `text-xs`
  (error `text-red-400`).
- Layout: 1-col default, `sm:grid-cols-2` for wide forms; primary action
  bottom-right, cancel to its left; `noValidate` (we own validation).
- **`Select`** = native `<select>` (robust/accessible) for closed sets;
  **`EntityPicker`** = async search-select for FK relations (WAI-ARIA combobox,
  removable chips for multi).
- Validation returns `ActionResult` `fieldErrors`/`formError` (see
  [ADR-010](../architecture/decisions/ADR-010-action-result-pattern.md)); field
  errors render under fields, form errors as a top banner + toast.

---

## Drawers

Component: **`Drawer`** (`components/admin/ui/Drawer.tsx`). Right-side panel for
create/edit/quick-view without leaving context.

- Width `w-full sm:max-w-md` / `sm:max-w-lg`; full height; `bg-[#0B0E14]
  border-l border-white/10 shadow-2xl`; scrim `bg-black/60 backdrop-blur-sm`.
- Header (title + optional description + close), scrollable body, sticky footer
  actions. Slides in with the `calm` easing.
- **A11y:** identical contract to Dialog (`role="dialog" aria-modal`, focus trap,
  `Esc`, scrim close, focus restore) via `useOverlay`.

---

## Toasts

Component: **`ToastProvider`** + **`useToast`** (`components/admin/ui/Toast.tsx`).
Transient feedback after mutations.

- Variants: `success` (emerald), `error` (red), `info` (blue) — each with a lucide
  icon; bottom-right stack, auto-dismiss (~4s), manual dismiss.
- Surface: `rounded-lg border border-white/10 bg-[#0B0E14] shadow-2xl`.
- **A11y:** live region `aria-live="polite"` (errors `role="alert"`); never the
  only channel for a critical error.
- **Scoping:** mounted per-module via each module's `layout.tsx` (deliberately not
  in the shared dashboard layout, to keep the Inquiry module untouched).

---

## Loading

Components: **`LoadingState`** + **`Skeleton`** (`components/admin/ui/LoadingState.tsx`).

- **Route level:** each module's `loading.tsx` renders layout-matching skeletons
  (`variant`: `table` · `list` · `card` · `detail`); shimmer `bg-white/[0.04]`
  pulse. Never a bare spinner for full pages.
- **In-place:** `useTransition` pending → dim/disable; `useOptimistic`/local state
  for instant board/table updates (with rollback).
- **Buttons:** inline spinner via `isLoading`.
- **A11y:** `aria-busy="true"` + `role="status"` + an `sr-only` "Loading…";
  skeletons `aria-hidden`.

---

## Empty States

Component: **`EmptyState`** (`components/admin/ui/EmptyState.tsx`). Icon tile +
title (`text-sm text-slate-300`) + subtitle (`text-xs text-slate-500`) + optional CTA.

- **First-run** ("No companies yet") → actionable CTA ("Add your first company").
- **No results** (filters/search active) → neutral copy + "Clear filters".
- **Dependency-gated** (e.g. Messages before Gmail sync) → copy pointing to the
  enabling step.

---

## Error States

Component: **`ErrorState`** (`components/admin/ui/ErrorState.tsx`, `"use client"`).

- **Segment errors:** each module's `error.tsx` boundary renders `ErrorState` with
  a concise message + "Try again" (`reset`); details never expose stack traces.
- **Not found:** detail routes' `not-found.tsx` render `EmptyState`.
- **Action errors:** toast (transient) or inline `formError` banner (forms).
- **Validation errors:** inline per field.
- **Empty ≠ error** — never show an error when the answer is simply "no data".

---

## Accessibility

Baseline for every screen (see [ADR-012](../architecture/decisions/ADR-012-accessible-drag-and-drop.md)
for the board pattern):

- [ ] Contrast ≥ 4.5:1 for text (avoid `text-slate-600` for essential text — dashes/disabled only).
- [ ] Meaning never by colour alone — badges/status pair colour + text (+ icon).
- [ ] Visible focus (`focus-visible:ring-2 ring-white/20`) on all interactive elements; **table rows** show focus via `focus-within`.
- [ ] Full keyboard operability: tab order, `Enter`/`Space`, arrow keys in menus/combobox; disabled pagination removed from tab order (`tabIndex=-1`).
- [ ] Dialogs/drawers: focus trap, `Esc`, focus restore, `role`/`aria-modal`, labelled by title.
- [ ] Forms: `<label htmlFor>`, `aria-invalid`, `aria-describedby`, required in text.
- [ ] Tables: `<th scope>`, sortable headers as links with `aria-sort`.
- [ ] Icon-only buttons have `aria-label`; decorative icons `aria-hidden`.
- [ ] Live regions for toasts and async result counts (`aria-live`).
- [ ] Drag-and-drop always has a keyboard alternative (per-card `<select>`).
- [ ] Landmarks: `<main>` (dashboard layout), `<section aria-labelledby>` on Dashboard/Analytics/Settings.
- [ ] Respect `prefers-reduced-motion`.

---

## Motion

- **One curve:** `cubic-bezier(0.22, 1, 0.36, 1)` — the `calm` easing (Tailwind
  `ease-calm`, shared with `lib/motion.ts`). Used for hover/press and
  entrance/exit alike.
- **Durations:** micro (hover/press) 150ms · UI (drawer/menu/toast) 200–250ms ·
  entrance reveals 300–600ms (`fade-in` 0.5s, `slide-up` 0.6s keyframes).
- **Purposeful only** — motion clarifies state change; no decorative loops.
- **Framer Motion** for orchestrated reveals; **CSS transitions** for
  hover/colour/opacity.
- **Reduced motion:** honor `prefers-reduced-motion: reduce` — drop
  translations/scales, keep opacity-only.

---

## Dark Theme

The admin/CRM surface is **dark-only** by design (a focused back-office tool).

| Role | Value |
|------|-------|
| Canvas | `#0B0E14` (`bg-[#0B0E14]`, set on the admin `<body>`) |
| Surfaces | `bg-white/[0.02]` → `[0.03]` → `[0.06]` (layering) |
| Borders | `border-white/[0.06]` (subtle `/[0.04]`, strong `/10`) |
| Text | white → slate-200 → 400 → 500 → 600 |
| Semantic hues | blue/amber/purple/emerald/red/slate at `/10` bg · `/400` text · `/20` border |
| Accent | `#2563EB` (`consulting.royal`), used sparingly |

- Overlays/menus/`<option>`s explicitly set `bg-[#0B0E14]` so native dropdowns
  match the surface.
- The **marketing** site is theme-aware (`next-themes`, light-first, `consulting`
  palette) — a separate system; do not mix admin dark tokens into marketing.

---

## Responsive Behaviour

Tailwind breakpoints: `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280.

- **App shell:** `flex` — fixed `w-60` sidebar (`shrink-0`) + `flex-1 min-w-0`
  main; page content `max-w-7xl mx-auto` (board views `max-w-none`).
- **Tables:** scroll inside `overflow-x-auto`; the page body never scrolls
  horizontally.
- **Boards (Kanban):** horizontal scroll of fixed-width (`w-72`) stage/status
  columns.
- **Forms:** `grid-cols-1` → `sm:grid-cols-2`; actions stack then right-align.
- **Toolbars:** filters/search stack on small screens, row on `sm`/`lg`.
- **Cards/metrics:** `grid-cols-2 → md:grid-cols-3 → xl:grid-cols-6` (stat rows).
- **Overlays:** drawers full-width on mobile (`w-full`), constrained on `sm+`.
- Relative units, `max-w-full` media, hit targets ≥ 32–40px.

---

## Cross-Referenced Components

| Section | Component(s) | File |
|---------|--------------|------|
| Buttons | `Button`, `buttonClasses` | `components/admin/ui/Button.tsx` |
| Badges | `Badge` (+ domain `*BadgeVariant`) | `components/admin/ui/Badge.tsx` |
| Cards | composition · `StatCard` · `BarList` | inline · `components/admin/dashboard/StatCard.tsx` · `components/admin/analytics/BarList.tsx` |
| Tables | `DataTable`, `Pagination` | `components/admin/ui/DataTable.tsx`, `Pagination.tsx` |
| Dialogs | `Dialog`, `ConfirmDialog` | `components/admin/ui/Dialog.tsx`, `ConfirmDialog.tsx` |
| Forms | `FormField`, `TextInput`, `Textarea`, `Select`, `EntityPicker`, `SearchInput`, `FilterBar` | `components/admin/ui/*` |
| Drawers | `Drawer` | `components/admin/ui/Drawer.tsx` |
| Toasts | `ToastProvider`, `useToast` | `components/admin/ui/Toast.tsx` |
| Loading | `LoadingState`, `Skeleton` | `components/admin/ui/LoadingState.tsx` |
| Empty | `EmptyState` | `components/admin/ui/EmptyState.tsx` |
| Error | `ErrorState` | `components/admin/ui/ErrorState.tsx` |
| Page header | `PageHeader` | `components/admin/ui/PageHeader.tsx` |
| Hooks | `useUrlParams`, `useOverlay` | `components/admin/ui/*` |

Full component APIs (props, variants, a11y, reuse matrix) in the
[Component Library](./COMPONENT_LIBRARY.md).

---

## Document Control

- **Version:** 1.1 (updated to reflect the implemented M0 kit at v1.0.0)
- **Owner:** Repository maintainer (Shivam Chaturvedi)
- **Last Updated:** 2026-07-28
- **Related:** [Component Library](./COMPONENT_LIBRARY.md) ·
  [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md) ·
  [ADRs](../architecture/decisions/README.md)

*Keep this in lockstep with `tailwind.config.js`, `app/globals.css`, and
`components/admin/ui/*`. Any new token starts here first.*
