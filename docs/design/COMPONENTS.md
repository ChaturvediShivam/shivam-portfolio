# Components (as-built reference)

The concrete API reference for every reusable admin component shipped at
**v1.0.0**, extracted from `components/admin/ui/*` (plus `StatCard`, `BarList`).
For visual tokens/standards see the [Design System](./DESIGN_SYSTEM.md); for the
original planning catalogue + reuse matrix see the
[Component Library](./COMPONENT_LIBRARY.md).

**Import:** `@/components/admin/ui` (barrel). **Class-merge:** `cn` from
`@/lib/utils`. **Icons:** `lucide-react`. Examples below are illustrative usage,
not implementation.

> **Legend:** ⚙️ **server-capable** (no `"use client"`) · 🖱️ **client** (`"use client"`).
> **Used By** reflects actual imports at v1.0.0.

**Quick index:** [Button](#button) · [Badge](#badge) · [PageHeader](#pageheader) ·
[DataTable](#datatable) · [Pagination](#pagination) · [FilterBar](#filterbar) ·
[SearchInput](#searchinput) · [FormField](#formfield) · [TextInput](#textinput) ·
[Textarea](#textarea) · [Select](#select) · [EntityPicker](#entitypicker) ·
[Drawer](#drawer) · [Dialog](#dialog) · [ConfirmDialog](#confirmdialog) ·
[Toast](#toast--toastprovider--usetoast) · [EmptyState](#emptystate) ·
[LoadingState](#loadingstate--skeleton) · [ErrorState](#errorstate) ·
[StatCard](#statcard) · [BarList](#barlist) · [Hooks](#hooks)

---

## Button
⚙️ `components/admin/ui/Button.tsx`
- **Purpose:** primary interaction control; also exposes `buttonClasses()` for styling `<Link>`s.
- **Props:** `variant?`, `size?`, `isLoading?`, + all `<button>` attributes. Also `buttonClasses(variant?, size?, className?)`.
- **Variants:** `primary` · `secondary` · `ghost` · `danger` · `icon`. Sizes: `sm` · `md`.
- **Accessibility:** real `<button>`; `focus-visible:ring`; `disabled`/`aria-busy` while `isLoading`; icon-only usage requires an `aria-label`.
- **Usage:** one `primary` per view; destructive actions use `danger` + a `ConfirmDialog`.
- **Dependencies:** `react`, `cn`, `lucide-react` (spinner).
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages (and inquiry components).
- **Example:** `<Button variant="primary" isLoading={pending}>Save</Button>` · `<Link className={buttonClasses("secondary")}>Edit</Link>`
- **Future:** `asChild` polymorphism; loading label; `link` variant.

## Badge
⚙️ `components/admin/ui/Badge.tsx`
- **Purpose:** compact status/label pill.
- **Props:** `variant?`, `dot?`, + `<span>` attributes.
- **Variants:** `info` · `progress` · `special` · `success` · `neutral` · `danger`.
- **Accessibility:** text carries the meaning (never colour alone); `dot` is `aria-hidden`.
- **Usage:** status/stage/priority via domain mappers (`stageBadgeVariant`, `statusBadgeVariant`, …).
- **Dependencies:** `react`, `cn`.
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages, Dashboard, Analytics, Settings.
- **Example:** `<Badge variant="success" dot>Connected</Badge>`
- **Future:** `outline` style; interactive (opens a status `Select`).

## PageHeader
⚙️ `components/admin/ui/PageHeader.tsx`
- **Purpose:** consistent page top — title, optional description/count/breadcrumb, right-aligned actions.
- **Props:** `title`, `description?`, `count?`, `countLabel?`, `breadcrumb?`, `actions?`, `className?`.
- **Variants:** list (with `count`/actions) vs detail (with `breadcrumb`).
- **Accessibility:** renders the page's single `<h1>`; actions in reading order.
- **Usage:** top of every page; hosts the primary "New …" button.
- **Dependencies:** `react`, `cn`.
- **Used By:** all admin modules.
- **Example:** `<PageHeader title="Companies" count={total} actions={<Link…>New company</Link>} />`
- **Future:** tab strip slot; saved-view selector; sticky-on-scroll.

## DataTable
⚙️ `components/admin/ui/DataTable.tsx` (generic `<T>`)
- **Purpose:** server-friendly typed table with sorting, row links, and states.
- **Props:** `columns: Column<T>[]`, `rows`, `getRowKey`, `rowHref?`, `sort?`, `hrefForSort?`, `isLoading?`, `loadingRows?`, `emptyState?`, `className?`. `Column<T>`: `key`, `header`, `render?`, `sortable?`, `align?`, `className?`, `headerClassName?`. `SortDir = "asc"|"desc"`.
- **Variants:** static vs sortable; loading (skeleton rows) vs empty (renders `emptyState`).
- **Accessibility:** semantic `<table>`, `<th scope="col">`, sortable headers are links with `aria-sort`; **row focus** via `focus-within`; whole-row nav is a stretched link on cell 0.
- **Usage:** all list pages; pair with `FilterBar` + `Pagination`.
- **Dependencies:** `react`, `cn`, `next/link`, `lucide-react`, `LoadingState`.
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages.
- **Example:** `<DataTable columns={cols} rows={rows} getRowKey={r=>r.id} rowHref={r=>"/admin/companies/"+r.id} sort={{key,dir}} hrefForSort={fn} emptyState={<EmptyState/>} />`
- **Future:** column visibility/reorder, sticky columns, row selection, virtualization.

## Pagination
⚙️ `components/admin/ui/Pagination.tsx`
- **Purpose:** numbered, server-friendly page navigation (anchor links, no client JS).
- **Props:** `page`, `pageSize`, `total`, `hrefForPage`, `className?`.
- **Variants:** hidden when a single page; offset-numbered (cursor variant is future).
- **Accessibility:** `<nav aria-label="Pagination">`; disabled prev/next are `aria-disabled` **and** removed from tab order (`tabIndex=-1`); current page announced.
- **Usage:** under every `DataTable`.
- **Dependencies:** `react`, `cn`, `next/link`, `lucide-react`.
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages.
- **Example:** `<Pagination page={p} pageSize={25} total={n} hrefForPage={pg=>build({page:pg})} />`
- **Future:** page-size selector; cursor/"load more" mode.

## FilterBar
🖱️ `components/admin/ui/FilterBar.tsx`
- **Purpose:** URL-driven filter row (selects/toggles) that server-renders results.
- **Props:** `filters: FilterConfig[]`, `children?`, `className?`. `FilterConfig`: `{type:"select", name, label, options, allLabel?}` | `{type:"toggle", name, label, onValue?}`.
- **Variants:** select (with an "All" clear option) · toggle (on/off). Custom controls via `children`.
- **Accessibility:** labelled controls; "Clear (n)" is a real button; active count announced.
- **Usage:** above tables/boards; pairs with `SearchInput`.
- **Dependencies:** `react`, `cn`, `lucide-react`, `useUrlParams` (`next/navigation`).
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages, Analytics.
- **Example:** `<FilterBar filters={[{type:"select",name:"stage",label:"Stage",options},{type:"toggle",name:"archived",label:"Show archived",onValue:"1"}]} />`
- **Future:** saved filter sets; collapsible popover when many; removable chips.

## SearchInput
🖱️ `components/admin/ui/SearchInput.tsx`
- **Purpose:** debounced free-text search bound to a URL param (drives FTS).
- **Props:** `param?` (default `"q"`), `placeholder?`, `debounceMs?` (default 300), `className?`.
- **Variants:** inline (toolbar) sizing via `className`.
- **Accessibility:** `role="search"` container; labelled input; clear button has `aria-label`.
- **Usage:** every list toolbar; resets pagination on change.
- **Dependencies:** `react`, `cn`, `lucide-react`, `useUrlParams`.
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages.
- **Example:** `<SearchInput param="q" placeholder="Search companies…" className="sm:max-w-xs" />`
- **Future:** field-scoped search; recent searches; command-palette entry.

## FormField
⚙️ `components/admin/ui/FormField.tsx`
- **Purpose:** label + control + hint/error wrapper that auto-wires accessibility.
- **Props:** `label`, `htmlFor`, `required?`, `hint?`, `error?`, `className?`, `children` (a single control element).
- **Variants:** stacked (default).
- **Accessibility:** associates `<label htmlFor>`, injects `id`, `aria-invalid`, `aria-describedby` into the child; required conveyed in text.
- **Usage:** wraps every form control.
- **Dependencies:** `react`, `cn` (uses `React.cloneElement`).
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages.
- **Example:** `<FormField label="Name" htmlFor="name" required error={errors.name}><TextInput …/></FormField>`
- **Future:** character counters; async-validation indicator.

## TextInput
⚙️ `components/admin/ui/TextInput.tsx`
- **Purpose:** single-line input; exposes `fieldClasses()` (shared input surface).
- **Props:** `invalid?`, + all `<input>` attributes (forwards ref).
- **Variants:** any native `type` (text/email/url/number/date).
- **Accessibility:** real `<input>`; `aria-invalid` when errored (via `FormField`).
- **Usage:** inside `FormField`.
- **Dependencies:** `react`, `cn`.
- **Used By:** Companies, Contacts, Opportunities, Tasks.
- **Example:** `<TextInput name="email" type="email" value={v} onChange={…} invalid={!!err} />`
- **Future:** input masks; prefix/suffix affixes.

## Textarea
⚙️ `components/admin/ui/Textarea.tsx`
- **Purpose:** multi-line text.
- **Props:** `invalid?`, `rows?` (default 4), + `<textarea>` attributes.
- **Accessibility:** labelled via `FormField`.
- **Usage:** descriptions, notes.
- **Dependencies:** `react`, `fieldClasses` (from `TextInput`).
- **Used By:** Companies, Opportunities, Tasks.
- **Example:** `<Textarea rows={3} value={body} onChange={…} />`
- **Future:** auto-resize; markdown/mentions; AI-draft affordance.

## Select
⚙️ `components/admin/ui/Select.tsx`
- **Purpose:** native `<select>` for small closed sets.
- **Props:** `invalid?`, `options: SelectOption[]`, `placeholder?`, + `<select>` attributes. `SelectOption = {value,label,disabled?}`.
- **Variants:** with/without a placeholder option.
- **Accessibility:** native `<select>` (robust keyboard/AT); chevron `aria-hidden`.
- **Usage:** stage/status/priority/type/enum selectors.
- **Dependencies:** `react`, `cn`, `lucide-react`, `fieldClasses`.
- **Used By:** Companies, Contacts, Opportunities, Tasks. *(Inquiry module has its own status/lead-source selects.)*
- **Example:** `<Select options={STAGES.map(s=>({value:s,label:humanize(s)}))} placeholder="—" />`
- **Future:** grouped options; option descriptions.

## EntityPicker
🖱️ `components/admin/ui/EntityPicker.tsx`
- **Purpose:** async search-and-select for related records (company/contact/opportunity).
- **Props:** `loadOptions(query)`, `value` (`EntityOption|EntityOption[]|null`), `onChange`, `multiple?`, `placeholder?`, `emptyMessage?`, `debounceMs?` (250), `disabled?`, `className?`. `EntityOption = {value,label,sublabel?}`.
- **Variants:** single (FK field) · multiple (removable chips) · with sublabels.
- **Accessibility:** WAI-ARIA combobox (`role="combobox"`, `aria-expanded/controls`, `listbox`/`option`, arrow/enter/esc); chip remove buttons labelled; outside-click + Backspace-to-remove.
- **Usage:** relation fields; fed by module `searchXAction` server actions.
- **Dependencies:** `react`, `cn`, `lucide-react`.
- **Used By:** Contacts, Opportunities, Tasks, Messages.
- **Example:** `<EntityPicker loadOptions={q=>searchCompaniesAction(q)} value={company} onChange={setCompany} placeholder="Search active companies…" />`
- **Future:** rich rows (avatar/subtitle); creatable; virtualized long lists; recently-used.

## Drawer
🖱️ `components/admin/ui/Drawer.tsx`
- **Purpose:** right-side panel for create/edit/quick-view without leaving context.
- **Props:** `open`, `onClose`, `title`, `description?`, `size?` (`md`|`lg`), `footer?`, `children`.
- **Variants:** `md` / `lg` width.
- **Accessibility:** `role="dialog" aria-modal`, focus trap, `Esc`, scrim click closes, focus restore, labelled by title (`useOverlay`); portalled.
- **Usage:** in-context forms/quick-views.
- **Dependencies:** `react`, `react-dom` (`createPortal`), `cn`, `lucide-react`, `useOverlay`, `useMounted`.
- **Used By:** **None yet** — built in M0, reserved for future in-context edit; modules currently use full-page forms.
- **Example:** `<Drawer open={open} onClose={close} title="Edit company" footer={<Button…/>}>{form}</Drawer>`
- **Future:** stacked drawers; unsaved-changes guard; deep-linkable (`?drawer=`).

## Dialog
🖱️ `components/admin/ui/Dialog.tsx`
- **Purpose:** centered modal for short, focused tasks/confirmations.
- **Props:** `open`, `onClose`, `title`, `description?`, `size?` (`sm`|`md`), `footer?`, `hideClose?`, `children?`.
- **Variants:** `sm`/`md`; `hideClose` for blocking flows.
- **Accessibility:** same contract as `Drawer` (trap/`Esc`/restore/labelled/portal).
- **Usage:** base for `ConfirmDialog`; short single-purpose modals.
- **Dependencies:** `react`, `react-dom`, `cn`, `lucide-react`, `useOverlay`.
- **Used By:** via `ConfirmDialog` — Companies, Contacts, Opportunities, Tasks.
- **Example:** `<Dialog open={open} onClose={close} title="Notice" footer={…}>…</Dialog>`
- **Future:** built-in async submit state.

## ConfirmDialog
🖱️ `components/admin/ui/ConfirmDialog.tsx`
- **Purpose:** confirm a destructive/irreversible action.
- **Props:** `open`, `title`, `description?`, `confirmLabel?`, `cancelLabel?`, `destructive?`, `isPending?`, `onConfirm`, `onCancel`.
- **Variants:** default vs `destructive` (danger styling).
- **Accessibility:** inherits `Dialog`; focus defaults to the safe (cancel) action; confirm requires explicit activation.
- **Usage:** archive/delete flows in each module's `*Actions` component.
- **Dependencies:** `Dialog`, `Button`.
- **Used By:** Companies, Contacts, Opportunities, Tasks.
- **Example:** `<ConfirmDialog open={o} title="Archive Acme?" destructive isPending={p} onConfirm={…} onCancel={…} />`
- **Future:** "type to confirm" for high-risk deletes.

## Toast · ToastProvider · useToast
🖱️ `components/admin/ui/Toast.tsx`
- **Purpose:** transient success/error/info feedback after mutations.
- **API:** `<ToastProvider duration?>`; `const { toast } = useToast(); toast({ variant, title, description? })`. `ToastVariant = "success"|"error"|"info"`.
- **Variants:** `success` (emerald) · `error` (red, `role="alert"`) · `info` (blue).
- **Accessibility:** `aria-live="polite"` region; dismissible; not the sole channel for critical errors.
- **Usage:** wrap a module subtree with `ToastProvider` (each module's `layout.tsx`); call `toast()` in client actions.
- **Dependencies:** `react` (context), `cn`, `lucide-react`.
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages (via module layouts).
- **Example:** `toast({ variant: "success", title: "Company created" })`
- **Future:** action toasts ("Undo"); queue/stacking limits; per-position.

## EmptyState
⚙️ `components/admin/ui/EmptyState.tsx`
- **Purpose:** communicate "nothing here" with the right next step.
- **Props:** `icon?`, `title`, `description?`, `action?`, `className?`.
- **Variants:** first-run (CTA) · no-results (clear filters) · dependency-gated (link to enabler).
- **Accessibility:** heading + descriptive text; CTA is a real button/link.
- **Usage:** `DataTable.emptyState`, `not-found.tsx`, empty panels/feeds.
- **Dependencies:** `react`, `cn`.
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages, Dashboard, Analytics.
- **Example:** `<EmptyState icon={<Building2/>} title="No companies yet" action={<Link…>New company</Link>} />`
- **Future:** illustration slot; role-aware copy.

## LoadingState · Skeleton
⚙️ `components/admin/ui/LoadingState.tsx`
- **Purpose:** layout-matching loading placeholders.
- **Props:** `LoadingState`: `variant?` (`table`|`card`|`detail`|`list`), `rows?` (6), `className?`. `Skeleton`: `<div>` attributes.
- **Variants:** four layout shapes.
- **Accessibility:** `aria-busy` + `role="status"` + `sr-only` "Loading…"; skeletons `aria-hidden`.
- **Usage:** each module's `loading.tsx`; `<Suspense>` fallbacks; inline skeletons.
- **Dependencies:** `react`, `cn`.
- **Used By:** Companies, Contacts, Opportunities, Tasks, Messages (+ Dashboard/Analytics/Settings via `Skeleton`).
- **Example:** `<LoadingState variant="table" />` · `<Skeleton className="h-7 w-40" />`
- **Future:** column-def-driven skeletons.

## ErrorState
🖱️ `components/admin/ui/ErrorState.tsx`
- **Purpose:** friendly, recoverable error surface.
- **Props:** `title?`, `message?`, `onRetry?`, `details?`, `className?`.
- **Variants:** inline panel · full-segment (`error.tsx`).
- **Accessibility:** `role="alert"`; "Try again" is a button; never exposes stack traces.
- **Usage:** each module's `error.tsx` (pass the boundary's `reset` to `onRetry`).
- **Dependencies:** `react`, `cn`, `lucide-react`, `Button`.
- **Used By:** all modules with an `error.tsx` (Companies…Settings).
- **Example:** `<ErrorState title="Couldn't load" onRetry={reset} />`
- **Future:** error-code catalogue; report-issue link.

## StatCard
⚙️ `components/admin/dashboard/StatCard.tsx`
- **Purpose:** compact operational metric tile.
- **Props:** `label`, `value` (number), `icon?`, `href?`, `alert?`.
- **Variants:** link vs static; `alert` (red value when > 0).
- **Accessibility:** value is real text; renders as a focusable link when `href` set (`aria-label` "label: value").
- **Usage:** Dashboard stat grid; Analytics scalar metrics.
- **Dependencies:** `react`, `cn`, `next/link`.
- **Used By:** Dashboard, Analytics.
- **Example:** `<StatCard label="Overdue tasks" value={n} href="/admin/tasks?overdue=1" alert />`
- **Future:** sparkline slot; delta/trend; loading skeleton.

## BarList
⚙️ `components/admin/analytics/BarList.tsx`
- **Purpose:** lightweight CSS horizontal bar chart (no chart library).
- **Props:** `items: BarItem[]`, `max?`, `className?`. `BarItem = {label, value, hint?, variant?}` (`variant` = `BadgeVariant`).
- **Variants:** bar colour by `BadgeVariant`; optional trailing `hint`.
- **Accessibility:** labelled rows announcing "label: value"; bar track is `role="presentation"`.
- **Usage:** Analytics funnel, conversions, top-companies, message direction.
- **Dependencies:** `react`, `cn`, `BadgeVariant` (type).
- **Used By:** Analytics.
- **Example:** `<BarList items={[{label:"Lead",value:12,variant:"neutral",hint:"40%"}]} max={30} />`
- **Future:** stacked/grouped bars; value formatting; tooltip.

---

## Hooks

### useUrlParams
🖱️ `components/admin/ui/useUrlParams.ts`
- **Purpose:** read/write URL search params for server-rendered list state.
- **API:** `const { searchParams, setParams } = useUrlParams()`; `setParams(updates, { resetPage? })` pushes a new URL.
- **Dependencies:** `next/navigation`.
- **Used By:** `SearchInput`, `FilterBar`.
- **Future:** typed param schemas; batch/replace mode.

### useMounted · useOverlay
🖱️ `components/admin/ui/useOverlay.ts`
- **Purpose:** `useMounted()` guards `createPortal`; `useOverlay(open,onClose,panelRef)` provides Escape-close, body scroll-lock, focus restore, initial focus, and a Tab focus-trap.
- **Dependencies:** `react`.
- **Used By:** `Drawer`, `Dialog`.
- **Future:** configurable initial-focus target; `inert` background.

---

## Not covered here (module features, not reusable kit)

Domain components live under `components/admin/<module>/` (e.g. `CompanyForm`,
`OpportunityForm`, `PipelineBoard`, `TaskBoard`, `StageSelect`, `StatusSelect`,
`MessageBody`, `*Actions`, panels). They compose the kit above and are documented
in their module code, not here.

---

## Document Control

- **Version:** 1.0
- **Owner:** Repository maintainer (Shivam Chaturvedi)
- **Last Updated:** 2026-07-28
- **Related:** [Design System](./DESIGN_SYSTEM.md) · [Component Library](./COMPONENT_LIBRARY.md) (planning catalogue + reuse matrix) · [ADR-012](../architecture/decisions/ADR-012-accessible-drag-and-drop.md)
- **Note:** APIs are as-built at v1.0.0; `Drawer` is implemented but not yet
  consumed. Keep this file in sync with `components/admin/ui/*`.
