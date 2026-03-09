import type { Transition, Variants } from "framer-motion";

// ---------------------------------------------------------------------------
// Duration tiers (seconds)
// ---------------------------------------------------------------------------
export const DURATION = {
  micro: 0.15,
  fast: 0.2,
  normal: 0.25,
  slow: 0.35,
  reveal: 0.4,
} as const;

// ---------------------------------------------------------------------------
// Easing curves
// ---------------------------------------------------------------------------
export const EASE = {
  /** General-purpose ease-out (matches CSS ease-out-quad) */
  out: [0.25, 0.46, 0.45, 0.94] as const,
  /** Snappy ease-out for enters */
  outQuart: [0.165, 0.84, 0.44, 1] as const,
  /** Smooth ease-out for scroll reveals (matches CSS surface-flow cubic-bezier) */
  outQuint: [0.22, 1, 0.36, 1] as const,
  /** Subtle ease-in for exits */
  inQuad: [0.55, 0.085, 0.68, 0.53] as const,
};

// ---------------------------------------------------------------------------
// Shared transitions
// ---------------------------------------------------------------------------
export const TRANSITION_ENTER: Transition = {
  duration: DURATION.normal,
  ease: EASE.outQuart,
};

export const TRANSITION_EXIT: Transition = {
  duration: DURATION.fast,
  ease: EASE.inQuad,
};

export const TRANSITION_REVEAL: Transition = {
  duration: DURATION.reveal,
  ease: EASE.outQuint,
};

// ---------------------------------------------------------------------------
// Enter / Exit recipes (Jakub Krehel style)
// ---------------------------------------------------------------------------
export const ENTER_FROM = {
  opacity: 0,
  y: 6,
} as const;

export const ENTER_TO = {
  opacity: 1,
  y: 0,
} as const;

export const EXIT_TO = {
  opacity: 0,
  y: -4,
} as const;

// ---------------------------------------------------------------------------
// Reusable variant objects
// ---------------------------------------------------------------------------

/** Standard enter/exit variant for AnimatePresence children */
export const FADE_VARIANTS: Variants = {
  initial: ENTER_FROM,
  animate: ENTER_TO,
  exit: EXIT_TO,
};

/** Container variant that staggers children */
export function staggerContainerVariants(
  delayChildren = 0.06,
  staggerChildren = 0.05,
): Variants {
  return {
    initial: {},
    animate: {
      transition: { delayChildren, staggerChildren },
    },
  };
}

/** Item variant used inside a stagger container */
export const STAGGER_ITEM_VARIANTS: Variants = {
  initial: ENTER_FROM,
  animate: {
    ...ENTER_TO,
    transition: TRANSITION_ENTER,
  },
  exit: {
    ...EXIT_TO,
    transition: TRANSITION_EXIT,
  },
};

// ---------------------------------------------------------------------------
// Lightweight enter/exit (no blur — for high-frequency interactions)
// ---------------------------------------------------------------------------
export const FADE_FAST_VARIANTS: Variants = {
  initial: { opacity: 0, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: DURATION.fast, ease: EASE.outQuart },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: DURATION.micro, ease: EASE.inQuad },
  },
};

// ---------------------------------------------------------------------------
// Scroll reveal — stronger "emerge" than FADE for intersection triggers
// ---------------------------------------------------------------------------
export const REVEAL_VARIANTS: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: TRANSITION_REVEAL,
  },
};

// ---------------------------------------------------------------------------
// Scale + fade — for content swap (e.g. inspector panel, keyed AnimatePresence)
// ---------------------------------------------------------------------------
export const SCALE_FADE_VARIANTS: Variants = {
  initial: { opacity: 0, scale: 0.97 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: TRANSITION_REVEAL,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: TRANSITION_EXIT,
  },
};
