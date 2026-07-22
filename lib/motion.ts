"use client";

import { useMotionValue, useSpring, useTransform } from "framer-motion";

// Single motion language for the entire site.
// One easing curve, two reveal weights (heading / grid item), one image
// treatment, one stagger rule — every section composes from these instead
// of defining its own timing. Values are lifted from Hero/AIResearch,
// which were already tuned and approved; this module just makes that the
// one source of truth instead of a per-file convention.
//
// Pacing is varied only through gridDelay's (base/rowStep/colStep) —
// never through new easing curves or durations — so every section still
// reads as the same motion language at a different pace.

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

/**
 * Row-and-column-aware stagger delay for grids. `base` is the pause after
 * the section heading before the grid begins (so content doesn't co-arrive
 * with the title); `rowStep`/`colStep` set how deliberately rows and
 * columns separate. Tune these per section for a different pace — never
 * the easing curve or duration.
 */
export function gridDelay(
  index: number,
  columns: number,
  opts: { base?: number; rowStep?: number; colStep?: number } = {}
) {
  const { base = 0.15, rowStep = 0.12, colStep = 0.06 } = opts;
  const row = Math.floor(index / columns);
  const col = index % columns;
  return base + row * rowStep + col * colStep;
}

/**
 * Physical-feeling tilt for a single held object (the Playbook cover).
 * Capped by the caller; a tight spring keeps it from feeling floaty or
 * elastic. Not for general use — this is a one-off for an "authority
 * asset," not a reusable hover effect.
 */
export function useTilt(maxDeg = 2) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springConfig = { stiffness: 220, damping: 26, mass: 0.5 };
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [maxDeg, -maxDeg]), springConfig);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-maxDeg, maxDeg]), springConfig);

  function onMouseMove(e: React.MouseEvent<HTMLElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return { rotateX, rotateY, onMouseMove, onMouseLeave };
}
