'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView } from 'framer-motion';
import { DURATION, useReducedMotionSafe } from '@lib/motion';

// The /about "At a glance" figure (DR-256): counts up from zero the first
// time it scrolls into view, once. A sibling to Reveal rather than a use of
// it -- Reveal animates a wrapper's opacity/transform, whereas this animates
// the rendered text itself, which no variant can express.
//
// `animate={false}` renders the value verbatim (the "Established 2019" stat,
// which would otherwise tick up through four meaningless years). Under
// prefers-reduced-motion every stat does the same, since a counting number
// is exactly the kind of motion that setting asks us to drop.
interface StatCounterProps {
  value: number;
  prefix?: string | null;
  suffix?: string | null;
  animate?: boolean;
}

const EASE_OUT_CUBIC = (p: number) => 1 - Math.pow(1 - p, 3);

export function StatCounter({ value, prefix, suffix, animate = true }: StatCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-80px' });
  const reduceMotion = useReducedMotionSafe();
  const shouldCount = animate && !reduceMotion;
  const [displayed, setDisplayed] = useState(shouldCount ? 0 : value);

  useEffect(() => {
    if (!shouldCount || !inView) return;
    const durationMs = DURATION.slow * 2000;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / durationMs);
      setDisplayed(Math.round(value * EASE_OUT_CUBIC(progress)));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [shouldCount, inView, value]);

  const settled = displayed >= value;

  return (
    <span ref={ref} className="font-display text-4xl font-extrabold leading-none text-amber sm:text-5xl">
      {prefix}
      {displayed}
      {/* Held back until the count lands so "15" doesn't read as "15+"
          while it's still climbing past smaller numbers. */}
      {settled ? suffix : ''}
    </span>
  );
}
