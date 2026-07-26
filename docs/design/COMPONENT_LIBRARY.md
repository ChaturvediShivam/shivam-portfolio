# Component Library

The reusable component catalogue for the Career CRM admin surface. Every Phase 2
module composes from these; this document is the contract each must satisfy.

**Related:** [README](../../README.md) · [Project Roadmap](../roadmap/PROJECT_ROADMAP.md) ·
[Design System](./DESIGN_SYSTEM.md) · [System Architecture](../architecture/SYSTEM_ARCHITECTURE.md)

**Status legend:** ✅ exists today · 🟡 exists specialized (generalize in M0) · ⬜ planned (build in M0/Phase 2)

**Conventions**
- All components consume [Design System](./DESIGN_SYSTEM.md) tokens — no ad-hoc colors, radii, or spacing.
- Presentational components are client components only when they need interactivity; data fetching stays in Server Components / the `lib` layer.
- Props are typed; enums come from `types/<entity>.ts` const arrays.
- Built in **Milestone 0** (foundation) unless noted, then reused across modules.

Quick index: [Layout & Nav](#layout--navigation) · [Data display](#data-display) ·
[Overlays](#overlays--feedback) · [Forms](#forms--inputs) · [Reuse matrix](#module-reuse-matrix)

---

## Layout & navigation

### PageHeader ⬜
- **Purpose.** Consistent page top: title, optional description, breadcrumb slot, and right-aligned actions.
- **Props.** `title: string` · `description?: string` · `breadcrumb?: ReactNode` · `actions?: ReactNode` · `count?: number`.
- **Variants.** with/without description; with/without actions; compact (list) vs detail.
- **Usage.** Top of every list and detail page; hosts the primary button and `SearchInput`.
- **Accessibility.** Renders a single `<h1>` (`text-xl`); actions are focusable in reading order.
- **Future.** Tab strip slot; saved-view selector; sticky-on-scroll option.

### Breadcrumb ⬜
- **Purpose.** Show location within nested detail routes (e.g. Companies › Acme › Edit).
- **Props.** `items: { label: string; href?: string }[]`.
- **Variants.** truncating (middle ellipsis) for deep paths.
- **Usage.** Detail/edit pages via `PageHeader.breadcrumb`.
- **Accessibility.** `<nav aria-label="Breadcrumb">` + ordered list; current item `aria-current="page"`, not a link.
- **Future.** Auto-generation from route segments.

### Tabs ⬜
- **Purpose.** Switch sub-views within a detail page (Overview / Contacts / Notes / Timeline / Tasks).
- **Props.** `tabs: { id; label; count?; href? }[]` · `active` · URL- or state-driven.
- **Variants.** underline (default) · pill; with count badges.
- **Usage.** Opportunity, Company, Contact detail pages; Settings sections.
- **Accessibility.** `role="tablist"`/`tab`/`tabpanel`, roving focus, `aria-selected`, arrow-key nav; if URL-driven, tabs are links.
- **Future.** Lazy panel loading; overflow "more" menu.

### ActionMenu ⬜
- **Purpose.** Overflow (`⋯`) menu of row/record actions (Edit, Archive, Delete…).
- **Props.** `items: { label; icon?; onSelect | href; destructive? }[]` · `align?`.
- **Variants.** row-level (table) · header-level (bulk); destructive items styled danger.
- **Usage.** `DataTable` last column, detail headers, card corners.
- **Accessibility.** Menu button `aria-haspopup="menu"`/`aria-expanded`; `role="menu"`/`menuitem`; arrow keys, `Esc`, focus return.
- **Future.** Bulk-selection actions; keyboard shortcuts.

---

## Data display

### DataTable 🟡 *(generalize `InquiriesTable`)*
- **Purpose.** Standard record table: typed columns, sort, row links, actions, states.
- **Props.** `columns: Column<T>[]` (`{ key, header, render?, sortable?, align?, width? }`) · `rows: T[]` · `sort?` · `onSortChange?` · `rowHref?(row)` · `isLoading?` · `emptyState?: ReactNode` · `selectable?`.
- **Variants.** static · sortable · selectable (checkboxes); compact vs comfortable density.
- **Usage.** All list pages (Companies, Contacts, Opportunities, Tasks, Messages, Inquiries).
- **Accessibility.** Semantic `<table>`; `<th scope="col">`; sortable headers are buttons with `aria-sort`; row link spans the row without trapping nested controls.
- **Future.** Column visibility/reorder, sticky columns, virtualization for large sets.

### Pagination ⬜
- **Purpose.** Navigate paged results.
- **Props.** offset mode `{ page, pageSize, total }` · cursor mode `{ nextCursor, prevCursor }` · `onChange`/URL-driven.
- **Variants.** numbered (offset) · prev/next (cursor, for `messages`).
- **Usage.** Bottom of every `DataTable`.
- **Accessibility.** `<nav aria-label="Pagination">`; current page `aria-current="page"`; disabled ends not focusable.
- **Future.** Page-size selector; "load more" infinite mode for boards.

### FilterBar 🟡 *(generalize inquiry `FilterBar`)*
- **Purpose.** Row of filter controls that write to the URL and server-render results.
- **Props.** `filters: FilterDef[]` (select/multiselect/daterange/toggle) · `value` from `searchParams` · `onChange` (URL push).
- **Variants.** inline · collapsible "Filters" popover when many.
- **Usage.** Above tables/boards in every list module.
- **Accessibility.** Labelled controls; clear-all is a button; active-filter chips are removable and announced.
- **Future.** Saved filter sets; per-user defaults.

### Timeline 🟡 *(generalize `ActivityTimeline`)*
- **Purpose.** Vertical chronological feed of events.
- **Props.** `events: { id; type; actorType?; detail; createdAt; icon? }[]` · `dense?`.
- **Variants.** full (detail page) · compact (dashboard feed); actor badge for `user|agent|system`.
- **Usage.** Opportunity timeline (`opportunity_events`), Dashboard recent activity, Inquiry activity.
- **Accessibility.** Ordered list; timestamps in `<time datetime>`; icons `aria-hidden` with text labels.
- **Future.** Grouping by day; filter by event type; AI-event styling.

### MetricCard 🟡 *(from `MetricsRow`)*
- **Purpose.** Single KPI tile: label, value, optional delta/trend.
- **Props.** `label` · `value` · `delta?` · `trend?: 'up'|'down'|'flat'` · `icon?` · `href?`.
- **Variants.** plain · with delta · with sparkline (later).
- **Usage.** Dashboard, Analytics; metric rows on detail pages.
- **Accessibility.** Value is real text (not just visual); trend conveyed with icon + text, not color alone.
- **Future.** Sparkline slot; loading skeleton; click-through to filtered view.

### StatCard ⬜
- **Purpose.** Larger composite stat block (title + primary number + secondary breakdown), e.g. funnel step.
- **Props.** `title` · `primary` · `breakdown?: { label; value }[]` · `accent?`.
- **Variants.** vertical · horizontal; with mini-bar.
- **Usage.** Analytics (funnel/rates), Dashboard pipeline snapshot.
- **Accessibility.** Structured headings; breakdown as a definition list.
- **Future.** Chart embed; comparison vs previous period.

### Badge ⬜
- **Purpose.** Generic labelled pill.
- **Props.** `variant: 'info'|'progress'|'special'|'success'|'neutral'|'danger'` · `children` · `icon?`.
- **Variants.** the six semantic hues (see Design System).
- **Usage.** Counts, tags, generic labels across modules.
- **Accessibility.** Text content carries meaning; icon `aria-hidden`.
- **Future.** `dot` (leading status dot) and `outline` styles.

### StatusBadge ✅ *(exists; extend per entity)*
- **Purpose.** Map a domain status enum → the correct `Badge` variant.
- **Props.** today `{ status: InquiryStatus }`; generalize to `{ status; map: Record<string, variant> }`.
- **Variants.** per-domain maps: inquiry, opportunity stage, task status/priority, integration status (see Design System → Status colours).
- **Usage.** Every module that renders a status/stage/priority.
- **Accessibility.** Label text always present.
- **Future.** Shared `statusMaps` module; interactive variant that opens a status `Select`.

---

## Overlays & feedback

### Drawer ⬜
- **Purpose.** Right-side panel for create/edit/quick-view in context.
- **Props.** `open` · `onClose` · `title` · `children` · `footer?` · `size?: 'md'|'lg'`.
- **Variants.** form drawer · read-only quick-view.
- **Usage.** Create/edit for Companies, Contacts, Opportunities, Tasks; message quick-view.
- **Accessibility.** `role="dialog" aria-modal`, focus trap, `Esc`, scrim click closes, focus restore, labelled by title.
- **Future.** Stacked drawers; unsaved-changes guard; deep-linkable (`?drawer=`).

### Dialog ⬜
- **Purpose.** Centered modal for short, focused, blocking tasks.
- **Props.** `open` · `onClose` · `title` · `children` · `footer?` · `size?`.
- **Variants.** form · informational.
- **Usage.** Quick create, single-field edits, notices.
- **Accessibility.** Same contract as Drawer.
- **Future.** Async submit states baked in.

### ConfirmDialog 🟡 *(pattern in `DeleteInquiryButton`)*
- **Purpose.** Confirm a destructive/irreversible action.
- **Props.** `open` · `title` · `description` · `confirmLabel` · `destructive?` · `onConfirm` · `isPending?`.
- **Variants.** default · destructive (danger styling).
- **Usage.** Archive/delete across all modules; disconnect integration.
- **Accessibility.** Focus defaults to the *safe* action; confirm requires explicit activation; labelled/among `role="dialog"`.
- **Future.** "Type to confirm" for high-risk deletes.

### Toast ⬜
- **Purpose.** Transient success/error feedback for actions.
- **Props.** imperative `toast({ variant, title, description?, duration? })`.
- **Variants.** success · error · info.
- **Usage.** After every server-action mutation (create/update/archive) across modules.
- **Accessibility.** `aria-live="polite"` region (assertive for errors); dismissible; not the *only* channel for critical errors.
- **Future.** Action toasts ("Undo archive"); queueing/stacking.

### EmptyState ⬜
- **Purpose.** Communicate "nothing here" with the right next step.
- **Props.** `icon` · `title` · `description?` · `action?: ReactNode` · `variant?: 'first-run'|'no-results'|'gated'`.
- **Variants.** first-run (CTA) · no-results (clear filters) · dependency-gated (link to enabler).
- **Usage.** Every list/board/detail-empty across modules.
- **Accessibility.** Heading + descriptive text; CTA is a real button/link.
- **Future.** Illustration slot; role-aware copy.

### LoadingState ⬜
- **Purpose.** Skeleton/placeholder while data resolves.
- **Props.** `variant: 'table'|'card'|'detail'|'board'` · `rows?`.
- **Variants.** per layout; shimmer via `bg-white/[0.03]` pulse.
- **Usage.** `loading.tsx` + `<Suspense>` fallbacks in every route segment.
- **Accessibility.** `aria-busy="true"`; skeletons `aria-hidden`; announce completion via result count.
- **Future.** Content-aware skeletons generated from column defs.

### ErrorState ⬜
- **Purpose.** Friendly recoverable error surface for a segment.
- **Props.** `title?` · `message` · `onRetry?` · `details?`.
- **Variants.** inline (panel) · full-segment (`error.tsx`).
- **Usage.** `error.tsx` boundaries; failed panels/widgets.
- **Accessibility.** Focus moves to the error; "Try again" is a button; no raw stack traces.
- **Future.** Error-code catalogue; report-issue link.

---

## Forms & inputs

### FormField ⬜
- **Purpose.** Wrapper: label + control slot + hint/error, consistent spacing.
- **Props.** `label` · `htmlFor` · `required?` · `hint?` · `error?` · `children`.
- **Variants.** stacked (default) · inline (settings).
- **Usage.** Every form field in every module.
- **Accessibility.** Associates `<label htmlFor>`, wires `aria-describedby` (hint/error) and `aria-invalid`; required conveyed in text.
- **Future.** Character counters; async-validation indicator.

### TextInput ⬜
- **Purpose.** Single-line text/email/url/number input.
- **Props.** standard input props · `invalid?` · `leftIcon?/rightIcon?`.
- **Variants.** text · email · url · number · search (see `SearchInput`).
- **Usage.** All create/edit forms.
- **Accessibility.** Real `<input>`; `aria-invalid` when errored; icons decorative/`aria-hidden`.
- **Future.** Input masks (phone), prefix/suffix affixes.

### Textarea ⬜
- **Purpose.** Multi-line text (descriptions, notes, message bodies).
- **Props.** input props · `rows?` · `autoResize?` · `maxLength?`.
- **Variants.** fixed · auto-resizing.
- **Usage.** Notes (opportunities/inquiries), task description, company description.
- **Accessibility.** Labelled; counter announced via `aria-describedby`.
- **Future.** Markdown/mentions for notes; AI-draft affordance.

### Select ⬜
- **Purpose.** Single choice from a small, fixed enum set.
- **Props.** `options: { value; label }[]` · `value` · `onChange` · `placeholder?`.
- **Variants.** native-styled · custom-popover; status-select (renders `StatusBadge` options).
- **Usage.** Stage/status/priority/lead-source/type selectors everywhere.
- **Accessibility.** Prefer native `<select>` for robustness; custom variant follows listbox pattern (`role`, arrows, typeahead).
- **Future.** Grouped options; option descriptions.

### Combobox ⬜
- **Purpose.** Type-ahead select with filtering (single/multi), for medium option sets.
- **Props.** `options | loadOptions(query)` · `value` · `multiple?` · `onChange` · `creatable?`.
- **Variants.** static · async · multi · creatable (add-on-the-fly tags/roles).
- **Usage.** Tags, `opportunity_contacts.role`, multi-filters.
- **Accessibility.** WAI-ARIA combobox: `aria-expanded`, `aria-controls`, active-descendant, arrow/enter/esc.
- **Future.** Virtualized long lists; recent/suggested section.

### EntityPicker ⬜ *(specialized async Combobox)*
- **Purpose.** Search-and-select a related record by FK (company, contact, opportunity).
- **Props.** `entity: 'company'|'contact'|'opportunity'` · `value` · `onChange` · `allowCreate?` · `multiple?`.
- **Variants.** single (FK field) · multi (`opportunity_contacts`); with inline "Create new".
- **Usage.** Contact→company; Opportunity→company/primary contact/account; Task→opp/contact/company; Message→link opportunity.
- **Accessibility.** Inherits Combobox; selected chips removable and announced.
- **Future.** Rich rows (avatar/subtitle); dedupe hints from `external_ids`; recently-used.

### SearchInput ⬜
- **Purpose.** Debounced free-text search bound to `?q=`.
- **Props.** `value` · `onChange` · `placeholder?` · `debounceMs?`.
- **Variants.** inline (toolbar) · prominent (page header).
- **Usage.** Every list module (drives FTS on `search_vector`).
- **Accessibility.** `role="search"` container; labelled; clear button `aria-label`.
- **Future.** Scoped search (field selector); recent searches; command-palette entry.

### DatePicker ⬜
- **Purpose.** Pick dates/datetimes (`due_at`, `next_action_at`, `applied_at`, filter ranges).
- **Props.** `value` · `onChange` · `mode: 'date'|'datetime'|'range'` · `min?/max?`.
- **Variants.** single · datetime · range (reuses inquiry date-range concept).
- **Usage.** Tasks, Opportunities, Analytics/Filter date ranges.
- **Accessibility.** Text input + calendar popup; grid `role`, arrow-key navigation, labelled; typeable fallback.
- **Future.** Presets (Today/7d/30d), timezone-aware display via contact `timezone`.

---

## Module reuse matrix

Which modules consume each component (✅ existing usage today).

| Component | Companies | Contacts | Opportunities | Tasks | Messages | Dashboard | Analytics | Settings |
|-----------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| PageHeader | ● | ● | ● | ● | ● | ● | ● | ● |
| Breadcrumb | ● | ● | ● | ● | ● | | | ● |
| Tabs | ● | ● | ● | | | | | ● |
| ActionMenu | ● | ● | ● | ● | ● | | | ● |
| DataTable | ● | ● | ● | ● | ● | | ● | ● |
| Pagination | ● | ● | ● | ● | ● | | | |
| FilterBar | ● | ● | ● | ● | ● | | ● | |
| Timeline | | | ● | | | ● | | |
| MetricCard | | | | | | ● | ● | |
| StatCard | | | | | | ● | ● | |
| Badge | ● | ● | ● | ● | ● | ● | ● | ● |
| StatusBadge | | | ● | ● | ● | ● | | ● |
| Drawer | ● | ● | ● | ● | ● | | | ● |
| Dialog | ● | ● | ● | ● | | | | ● |
| ConfirmDialog | ● | ● | ● | ● | ● | | | ● |
| Toast | ● | ● | ● | ● | ● | ● | | ● |
| EmptyState | ● | ● | ● | ● | ● | ● | ● | ● |
| LoadingState | ● | ● | ● | ● | ● | ● | ● | ● |
| ErrorState | ● | ● | ● | ● | ● | ● | ● | ● |
| FormField | ● | ● | ● | ● | ● | | | ● |
| TextInput | ● | ● | ● | ● | | | | ● |
| Textarea | ● | ● | ● | ● | ● | | | ● |
| Select | ● | ● | ● | ● | ● | | ● | ● |
| Combobox | ● | ● | ● | ● | ● | | ● | |
| EntityPicker | | ● | ● | ● | ● | | | |
| SearchInput | ● | ● | ● | ● | ● | | | |
| DatePicker | | | ● | ● | | | ● | |

Legend: ● = used by that module. Foundation components (EmptyState / LoadingState /
ErrorState / PageHeader / Toast) are effectively universal.

---

*Build order: the foundation kit lands in **Milestone 0** (see
[Project Roadmap](../roadmap/PROJECT_ROADMAP.md)) before any entity module. Keep
this catalogue updated as components are implemented and generalized.*
