// Single motion language for the entire site.
// One easing curve, two reveal weights (heading / grid item), one image
// treatment, one stagger rule — every section composes from these instead
// of defining its own timing. Values are lifted from Hero/AIResearch,
// which were already tuned and approved; this module just makes that the
// one source of truth instead of a per-file convention.

type Reduce = boolean | null | undefined;

/** Calm, non-bouncing ease. Mirrors tailwind.config.js `ease-calm`. */
export const EASE_CALM = [0.22, 1, 0.36, 1] as const;

/** Trigger reveals slightly before the element is fully in view so nothing pops in abruptly. */
export const VIEWPORT_REVEAL = { once: true, margin: "-80px" } as const;

/** Section eyebrows, H2s, standalone paragraphs — the largest reveal weight. */
export function headingReveal(reduce: Reduce, delay = 0) {
  return reduce
    ? {
        initial: { opacity: 0 },
        whileInView: { opacity: 1 },
        viewport: VIEWPORT_REVEAL,
        transition: { duration: 0.3, delay },
      }
    : {
        initial: { opacity: 0, y: 18 },
        whileInView: { opacity: 1, y: 0 },
        viewport: VIEWPORT_REVEAL,
        transition: { duration: 0.7, ease: EASE_CALM, delay },
      };
}

/** Cards and list entries in a grid — shorter travel, shorter duration, stagger-friendly. */
export function itemReveal(reduce: Reduce, delay = 0) {
  return reduce
    ? {
        initial: { opacity: 0 },
        whileInView: { opacity: 1 },
        viewport: VIEWPORT_REVEAL,
        transition: { duration: 0.3, delay },
      }
    : {
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: VIEWPORT_REVEAL,
        transition: { duration: 0.5, ease: EASE_CALM, delay },
      };
}

/** Portraits, covers — depth via a faint scale, not a directional slide. */
export function imageReveal(reduce: Reduce, delay = 0) {
  return reduce
    ? {
        initial: { opacity: 0 },
        whileInView: { opacity: 1 },
        viewport: VIEWPORT_REVEAL,
        transition: { duration: 0.4, delay },
      }
    : {
        initial: { opacity: 0, y: 28, scale: 0.985 },
        whileInView: { opacity: 1, y: 0, scale: 1 },
        viewport: VIEWPORT_REVEAL,
        transition: { duration: 0.9, ease: EASE_CALM, delay },
      };
}

/** Stagger delay keyed by column position so it never grows unbounded on long grids. */
export function gridDelay(index: number, columns: number, step = 0.07) {
  return (index % columns) * step;
}
