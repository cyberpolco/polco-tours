'use client';

import type { ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { fadeUpVariants, staggerContainerVariants, useReducedMotionSafe } from '@lib/motion';

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

// A sibling to Reveal, not an extension of it -- Reveal's fade+translateY
// contract is used identically everywhere today, and staggering children
// needs framer-motion's parent/child `variants` mechanism rather than
// Reveal's plain initial/whileInView props, so folding stagger into Reveal
// itself would force every existing call site to restructure for no
// benefit. Use this instead when a group of items (e.g. a card grid) should
// cascade in rather than reveal as one block.
type ContainerTag = 'div' | 'ul';
type ItemTag = 'div' | 'li';

// framer-motion's `motion.div`/`motion.ul`/`motion.li` are fixed exports,
// not dynamically callable with an arbitrary tag string -- a small lookup
// table keeps `as`/`itemAs` type-safe without reaching for an unsupported
// `motion(tag)` call.
const MOTION_CONTAINER: Record<ContainerTag, typeof motion.div | typeof motion.ul> = {
  div: motion.div,
  ul: motion.ul,
};
const MOTION_ITEM: Record<ItemTag, typeof motion.div | typeof motion.li> = {
  div: motion.div,
  li: motion.li,
};

interface RevealGroupProps {
  children: ReactNode[];
  as?: ContainerTag;
  itemAs?: ItemTag;
  className?: string;
  itemClassName?: string;
}

export function RevealGroup({ children, as = 'div', itemAs = 'div', className, itemClassName }: RevealGroupProps) {
  const reduceMotion = useReducedMotionSafe();
  const As = as;
  const ItemAs = itemAs;

  if (reduceMotion) {
    return (
      <As className={className}>
        {children.map((child, index) => (
          <ItemAs key={index} className={itemClassName}>
            {child}
          </ItemAs>
        ))}
      </As>
    );
  }

  const MotionAs = MOTION_CONTAINER[as];
  const MotionItemAs = MOTION_ITEM[itemAs];

  return (
    <MotionAs
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={staggerContainerVariants}
    >
      {children.map((child, index) => (
        <MotionItemAs key={index} className={itemClassName} variants={fadeUpVariants}>
          {child}
        </MotionItemAs>
      ))}
    </MotionAs>
  );
}
