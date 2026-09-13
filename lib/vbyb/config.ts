/**
 * VBYB constants shared by the server layer, webhooks and admin UI.
 */

/** The founding launch row seeded by the migration. */
export const VBYB_LAUNCH_SLUG = "founding-v1";

/** Admin route root for the module. */
export const VBYB_BASE_PATH = "/admin/validate-before-you-build";

/**
 * Hours from submission to promised delivery. Mirrored by the `overdue` count in
 * the vbyb_launch_metrics SQL function — change both together.
 */
export const DELIVERY_WINDOW_HOURS = 48;

/** Row cap for admin lists. A founding launch has at most a handful of orders. */
export const LIST_LIMIT = 500;

/** Below this many observations a rate is shown as "Insufficient data". */
export const MIN_RATE_SAMPLE = 5;

/** Below this many deliveries the median is shown as "Insufficient data". */
export const MIN_MEDIAN_SAMPLE = 3;
