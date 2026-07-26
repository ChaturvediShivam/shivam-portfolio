# Design System

The visual language for the Career CRM admin surface. It is minimal,
enterprise-grade, and Linear/Vercel-inspired — a dark, low-chroma canvas where
content and data lead and chrome recedes.

**Related:** [README](../../README.md) · [Project Roadmap](../roadmap/PROJECT_ROADMAP.md) ·
[Component Library](./COMPONENT_LIBRARY.md) · [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md)

> Two surfaces exist. The **marketing** site uses the `consulting` palette
> (navy/royal, light-first). This document governs the **admin / CRM** surface
> (dark, slate + white-alpha). Values below are the tokens already in use across
> `app/admin` and `components/admin`; extend them, don't reinvent them.

---

## Design principles

1. **Content first, chrome last.** Surfaces are near-black; borders are barely-there
   white-alpha. Ink, not boxes, creates hierarchy.
2. **Calm and quiet.** Low chroma, restrained motion, generous but not loose spacing.
3. **One consistent unit of everything.** A single type scale, spacing step, radius
   set, and easing curve — reused everywhere.
4. **Legible density.** Enterprise tools show a lot; default to `text-sm`, tight
   rhythm, and scannable tables.
5. **State is explicit.** Every surface has defined empty, loading, and error states.
6. **Accessible by default.** Sufficient contrast, focus-visible rings, keyboard paths.

---

## Typography scale

System font stack (marketing uses `Inter`; admin inherits the app font). Weights:
`font-medium` (500) for emphasis, `font-semibold` (600) for headings. Avoid bold-700 in-app.

| Token | Tailwind | Size / line | Use |
|-------|----------|-------------|-----|
| Display | `text-xl` | 20px | Page titles (`PageHeader` h1) |
| Heading | `text-lg` | 18px | Section headings, drawer titles |
| Body | `text-sm` | 14px | **Default** — body, table cells, inputs, nav |
| Caption | `text-xs` | 12px | Metadata, badges, helper/error text, table headers |

- Primary text `text-slate-200`; headings `text-white`.
- Secondary `text-slate-400`; muted/meta `text-slate-500`; disabled `text-slate-600`.
- Table column headers: `text-xs`, `text-slate-500`, often uppercase/tracked.

---

## Spacing system

4px base unit; use Tailwind's default scale. Common admin rhythm:

| Context | Classes |
|--------|---------|
| Page padding | `p-6 md:p-10` |
| Card / panel padding | `p-4` (compact) · `p-6` (roomy) |
| Nav item padding | `px-3 py-2` |
| Badge padding | `px-2 py-0.5` |
| Stack gap (tight) | `space-y-0.5` (nav) · `space-y-1` |
| Stack gap (content) | `space-y-4` · `space-y-6` |
| Inline gap | `gap-2` (icon+label) · `gap-3` |
| Content max width | `max-w-7xl mx-auto` |

---

## Grid system

- **App shell:** `flex` — fixed `w-60` sidebar (`shrink-0`) + `flex-1 min-w-0` main.
- **Content:** `max-w-7xl mx-auto` centered column.
- **Cards / metrics:** responsive `grid` — `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` for metric rows; `gap-4`.
- **Two-pane (messages/detail):** `grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]` list + reader.
- Always guard overflow with `min-w-0`; wide content (tables) scrolls inside `overflow-x-auto`.

---

## Border radius

| Token | Class | Use |
|-------|-------|-----|
| Default | `rounded-md` (6px) | Buttons, inputs, nav items, most surfaces |
| Card | `rounded-lg` (8px) | Cards, panels, drawers, modals |
| Pill | `rounded-full` | Badges, avatars, status dots |

---

## Shadow scale

The dark surface leans on **borders and background elevation**, not heavy shadows.

| Level | Approach |
|-------|----------|
| Flat (0) | `border border-white/[0.06]` — default panels |
| Raised (1) | `bg-white/[0.03]` over the page — cards, table rows on hover |
| Elevated (2) | `bg-white/[0.06]` + `border-white/10` — active/selected, popovers |
| Overlay (3) | Drawers/modals: `bg-[#0B0E14]` + `border-white/10` + a soft `shadow-2xl shadow-black/40` and a `bg-black/60 backdrop-blur-sm` scrim |

---

## Color palette

**Admin surface (primary for CRM).**

| Role | Value |
|------|-------|
| Canvas | `#0B0E14` (`bg-[#0B0E14]`) |
| Surface 1 | `bg-white/[0.02]` |
| Surface 2 | `bg-white/[0.03]` |
| Surface 3 / active | `bg-white/[0.06]` |
| Hairline border | `border-white/[0.06]` (subtle `/[0.04]`, strong `/10`) |
| Text primary | `text-white` / `text-slate-200` |
| Text secondary | `text-slate-400` |
| Text muted | `text-slate-500` |
| Text disabled | `text-slate-600` |
| Accent (marketing/royal) | `#2563EB` (`consulting.royal`) — used sparingly in-app |

**Semantic hues** (used at `/10` bg, `/400` text, `/20` border):
`blue` (info/new) · `amber` (warning/in-progress) · `purple` (special) ·
`emerald` (success/positive) · `red` (danger/error) · `slate` (neutral/closed).

**Marketing surface** (`consulting` palette, for reference): navy `#0A192F`/`#112240`/`#020C1B`,
royal `#2563EB`, slate `#64748B`, backgrounds `#F8FAFC` (light)/`#020C1B` (dark).

---

## Badge variants

Base: `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border`,
plus a color triplet `bg-{hue}-500/10 text-{hue}-400 border-{hue}-500/20`.

| Variant | Hue | Meaning |
|---------|-----|---------|
| `info` | blue | new / informational |
| `progress` | amber | in progress / pending |
| `special` | purple | follow-up / flagged |
| `success` | emerald | converted / hired / positive |
| `neutral` | slate | closed / archived / default |
| `danger` | red | spam / error / rejected |

---

## Status colours

Canonical mappings (extend per entity via a `Record<Status, triplet>`, as
`StatusBadge` already does for inquiries).

| Domain | Status → hue |
|--------|--------------|
| Inquiry | New→blue · In Progress→amber · Follow Up→purple · Converted→emerald · Closed→slate · Spam→red |
| Opportunity stage | lead→slate · applied→blue · screening→cyan · interview→amber · offer→purple · hired→emerald · rejected→red · withdrawn→slate · on_hold→slate |
| Task status | todo→slate · in_progress→amber · blocked→red · done→emerald · cancelled→slate |
| Task priority | low→slate · medium→blue · high→amber · urgent→red |
| Integration status | pending→slate · connected→emerald · syncing→blue · error→red · disconnected→slate |

---

## Button hierarchy

| Level | Style | Use |
|-------|-------|-----|
| **Primary** | `bg-white text-slate-900 hover:bg-slate-200 rounded-md px-3 py-2 text-sm font-medium` | The single main action per view |
| **Secondary** | `bg-white/[0.06] text-slate-200 border border-white/10 hover:bg-white/[0.1]` | Supporting actions |
| **Ghost** | `text-slate-400 hover:text-white hover:bg-white/[0.06]` | Toolbar/inline (matches sidebar & sign-out) |
| **Danger** | `text-red-400 hover:bg-red-500/10 border-red-500/20` | Destructive; always via `ConfirmDialog` |
| **Icon** | Ghost + square, `size-8`, centered lucide icon `size={15–16}` | Compact actions |

States: `disabled:opacity-50 disabled:cursor-not-allowed`; loading swaps label for a spinner; all get `focus-visible:ring-2 ring-white/20`.

---

## Form guidelines

- Compose from `FormField` (label + control + hint/error). Labels `text-sm text-slate-300`; hints/errors `text-xs`.
- Inputs: `bg-white/[0.03] border border-white/10 rounded-md px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600`, `focus-visible:ring-2 ring-white/20 focus:border-white/20`.
- One column by default; group related fields; primary action bottom-right, cancel to its left.
- Validation: inline, on blur + on submit; error text `text-red-400`; invalid control `border-red-500/40`; never rely on color alone (include text + `aria-invalid`).
- Required marked with `*`; disabled fields dimmed (`opacity-50`).
- Server actions return `{ ok, fieldErrors, formError }`; map `fieldErrors` under fields, `formError` to a top banner/toast.

---

## Table standards

- `DataTable`: header row `text-xs text-slate-500` (sticky on scroll), body `text-sm text-slate-200`.
- Row separators `divide-y divide-white/[0.06]`; row hover `hover:bg-white/[0.03]`; selected `bg-white/[0.06]`.
- Cell padding `px-4 py-3`; numeric columns right-aligned + tabular figures.
- First column identity/name (link to detail); last column right-aligned `ActionMenu`.
- Horizontal overflow scrolls inside `overflow-x-auto`; never break the page layout.
- Sortable headers show a caret and are keyboard-activatable; sort state in the URL.
- Pairs with `FilterBar` (top) and `Pagination` (bottom). Empty → `EmptyState`; loading → skeleton rows.

---

## Drawer standards

- Right-side panel for create/edit/quick-view without leaving context.
- Width `w-full sm:max-w-md lg:max-w-lg`; full height; `bg-[#0B0E14] border-l border-white/10`.
- Scrim `bg-black/60 backdrop-blur-sm`. Slides in with the `calm` easing (~200–250ms).
- Header: title + close (`X`, `aria-label="Close"`); footer: sticky actions.
- Focus trapped inside; `Esc` closes; focus returns to the trigger; `role="dialog" aria-modal="true"`.

---

## Modal standards

- Centered `Dialog` for focused tasks/confirmations; `max-w-md`, `rounded-lg`, same scrim.
- Reserve for short, blocking interactions; prefer drawers for forms.
- `ConfirmDialog` variant: title, body, cancel (secondary) + confirm (primary/danger); destructive confirms use danger styling and require an explicit click.
- Same a11y contract as drawers (focus trap, `Esc`, labelled).

---

## Empty states

`EmptyState` = centered icon (lucide, `size-6` in a `rounded-lg bg-white/[0.03]` tile) + title (`text-sm text-slate-300`) + subtitle (`text-xs text-slate-500`) + optional primary CTA.

- **First-run** ("No companies yet") → actionable CTA ("Add your first company").
- **No results** (filters/search) → neutral copy + "Clear filters".
- **Dependency-gated** (Messages before Gmail) → link to the enabling step (Settings).

---

## Loading states

- **Route level:** `loading.tsx` + `<Suspense>` render **skeletons** matching final layout (shimmer via `bg-white/[0.03]` + subtle pulse). Never a bare spinner for full pages.
- **In-place:** `useTransition` pending → dim + disable; `useOptimistic` for instant table/board updates.
- **Buttons:** replace label with inline spinner; keep width stable.
- **Async selects (`EntityPicker`, `Combobox`):** inline spinner in the field.

---

## Error states

- **Segment errors:** `error.tsx` boundary with a concise message + "Try again" (reset) + optional details; never expose stack traces to users.
- **Not found:** `not-found.tsx` for missing detail records.
- **Action errors:** `Toast` (transient) or inline `formError` banner (form context).
- **Validation errors:** inline per field (see Forms).
- **Empty vs error are distinct** — never show "error" when the answer is simply "no data".

---

## Responsive behaviour

- **Breakpoints:** Tailwind defaults (`sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280).
- **Sidebar:** fixed `w-60` from `lg`; below `lg` it collapses to an overlay drawer triggered from a top bar (Phase 2 nav enhancement).
- **Tables → cards:** on small screens, dense tables may switch to stacked card rows or scroll horizontally in an `overflow-x-auto` wrapper.
- **Boards (Kanban):** horizontal scroll of stage columns on small screens.
- Relative units, `max-w-full` media, no horizontal page scroll ever.

---

## Accessibility checklist

- [ ] Color contrast ≥ 4.5:1 for text (verify slate-on-#0B0E14 usages; avoid slate-600 for essential text).
- [ ] Never encode meaning in color alone — pair badges/status with text + icon.
- [ ] Visible focus: `focus-visible:ring-2 ring-white/20` on all interactive elements.
- [ ] Full keyboard operability: tab order, `Enter`/`Space` activation, arrow keys in menus/tabs.
- [ ] Dialogs/drawers: focus trap, `Esc` to close, focus restore, `role`/`aria-modal`, labelled by title.
- [ ] Forms: `<label htmlFor>`, `aria-invalid`, `aria-describedby` for hints/errors, required conveyed in text.
- [ ] Tables: `<th scope>`, sortable headers as buttons with `aria-sort`.
- [ ] Icon-only buttons have `aria-label`; decorative icons `aria-hidden`.
- [ ] Live regions (`aria-live="polite"`) for toasts and async result counts.
- [ ] Respect `prefers-reduced-motion` (see Motion).
- [ ] Hit targets ≥ 32–40px; adequate spacing on touch.

---

## Motion guidelines

- **One curve:** `cubic-bezier(0.22, 1, 0.36, 1)` — the `calm` easing (Tailwind `ease-calm`, shared with `lib/motion.ts`). Use for hover/press and entrance/exit alike.
- **Durations:** micro (hover/press) 150ms · UI (drawer/menu/toast) 200–250ms · entrance reveals 300–600ms (`fade-in` 0.5s, `slide-up` 0.6s keyframes).
- **Purposeful only:** motion clarifies state change (open/close, appear/settle); no decorative looping.
- **Framer Motion** for orchestrated reveals; **CSS transitions** for simple hover/color/opacity.
- **Reduced motion:** honor `prefers-reduced-motion: reduce` — drop translations/scales, keep instant/opacity-only changes.

---

*Keep this in lockstep with `tailwind.config.js`, `app/globals.css`, and the
component library. Any new token starts here first.*
