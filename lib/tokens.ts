// Phase 1 visual-identity tokens — Hero and Navbar only for now.
// These formalize patterns that already existed ad hoc (the button shadow
// pair was duplicated across Hero/Contact/Ebook as identical literal
// strings) into one source of truth, the same way EASE_CALM in ./motion.ts
// centralized timing. Existing colors and EASE_CALM are untouched here —
// they're load-bearing for every other section and are out of scope for
// this phase.
//
// Radius scale (Tailwind's own utilities — documented, not reinvented):
//   rounded-full   pills, badges, icon-circle buttons, the floating navbar
//   rounded-xl     cards, panels
//   rounded-lg     buttons, inputs
//
// Hover language:
//   Primary/secondary actions — color shift + shadow growth + a small
//   upward lift (-translate-y-0.5). Tertiary text links — color shift only,
//   no lift, no shadow. Chrome (nav, dividers) — no hover reaction at all;
//   only things a user can act on ever respond to hover.

/** Resting elevation for primary buttons — same navy-tinted shadow used across Hero/Contact/Ebook CTAs. */
export const ELEVATION_REST = "shadow-[0_8px_20px_-12px_rgba(10,25,47,0.50)]";

/** Hover elevation for primary buttons — pairs with ELEVATION_REST. */
export const ELEVATION_HOVER = "hover:shadow-[0_12px_28px_-12px_rgba(10,25,47,0.55)]";

/**
 * Floating-chrome elevation — wider, softer, lower-alpha than a button shadow
 * (it's lifting a whole bar, not a small control), but the same rgba hue
 * (10,25,47 — consulting-navy) so it reads as the same shadow language.
 */
export const ELEVATION_FLOATING = "shadow-[0_8px_30px_-8px_rgba(10,25,47,0.18)]";
