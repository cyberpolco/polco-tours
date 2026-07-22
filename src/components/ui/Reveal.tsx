'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';

// DR-068: a small, reusable scroll-reveal wrapper -- fades/slides a section
// in the first time it scrolls into view, once, never replayed. Falls back
// to a plain unanimated div under `prefers-reduced-motion` (checked via
// framer-motion's own hook, since this uses whileInView/opacity-transform
// animations the global CSS safety net in globals.css doesn't cover).
// Client Component boundary only -- children can still be Server-rendered
// content passed down from a Server Component page.
interface RevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.6, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}
