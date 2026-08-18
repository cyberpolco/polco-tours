'use client';

import { useReducedMotion } from 'framer-motion';
import type { Variants } from 'framer-motion';

// Shared motion constants/variants so every new animated surface reuses the
// same feel (and the same reduced-motion discipline) instead of each
// component re-deriving its own duration/easing/variants ad hoc. Durations
// match values already in use elsewhere (Table/Button hovers use 0.15-0.2s,
// Reveal uses 0.6s + 'easeOut').
export const EASE_OUT = 'easeOut';

export const DURATION = {
  fast: 0.15,
  base: 0.3,
  slow: 0.6,
} as const;

export const fadeUpVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

export const fadeInVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export const staggerContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

// Directional slide for a client-state wizard step transition (e.g.
// plan-my-trip's step index) -- `custom` is the direction (1 = forward,
// -1 = back), passed to <AnimatePresence custom={direction}>.
export const slideXVariants: Variants = {
  enter: (direction: number) => ({ x: direction > 0 ? 24 : -24, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction > 0 ? -24 : 24, opacity: 0 }),
};

/**
 * Every new animated surface calls this instead of useReducedMotion()
 * directly -- keeps the reduced-motion branch identical everywhere rather
 * than each component re-implementing the `?? false` fallback.
 */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false;
}
