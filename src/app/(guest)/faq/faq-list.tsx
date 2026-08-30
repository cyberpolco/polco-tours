'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { AnimatePresence, motion } from 'framer-motion';
import type { CmsFaqEntryView } from '@modules/cms';
import { Card } from '@/components/ui/Card';
import { DURATION, EASE_OUT, useReducedMotionSafe } from '@lib/motion';

interface Props {
  faqs: CmsFaqEntryView[];
}

// Explicit user request: each card is clickable (click toggles the answer,
// not just hover -- hover alone has no equivalent on touch devices), with a
// resting shadow that lifts further on hover (Card's own `interactive` prop,
// DR-068's existing hover-elevation convention -- no new shadow tokens),
// plus an animated expand/collapse. Each card owns its own open state --
// independent toggles, not a single-open accordion -- since nothing here
// needs "only one answer visible at a time."
function FaqCard({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotionSafe();

  return (
    <Card as="div" interactive className="mb-4 break-inside-avoid">
      <dt>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="flex w-full cursor-pointer items-center justify-between gap-3 text-left font-semibold text-navy"
        >
          <span>{question}</span>
          <motion.svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-mist"
            aria-hidden="true"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: DURATION.fast, ease: EASE_OUT }}
          >
            <path d="M5 8l5 5 5-5" />
          </motion.svg>
        </button>
      </dt>
      {reduceMotion ? (
        isOpen && <dd className="mt-2 text-sm text-mist">{answer}</dd>
      ) : (
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.dd
              key="answer"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: DURATION.base, ease: EASE_OUT }}
              className="overflow-hidden text-sm text-mist"
            >
              <p className="mt-2">{answer}</p>
            </motion.dd>
          )}
        </AnimatePresence>
      )}
    </Card>
  );
}

// Client-side only -- the list is small (a few dozen entries at most), so a
// plain substring filter is the whole "search engine," no new dependency
// (charter rule 4) or server round-trip needed. Styled like the only other
// guest-facing search box in the app, (guest)/packages/page.tsx's pill input
// -- that one round-trips through ?q= server-side, this one filters live.
export function FaqList({ faqs }: Props) {
  const t = useTranslations('FaqPage');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter(({ question, answer }) => `${question} ${answer}`.toLowerCase().includes(q));
  }, [faqs, query]);

  return (
    <>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('searchPlaceholder')}
        aria-label={t('searchPlaceholder')}
        className="mt-6 w-full max-w-xs rounded-pill border border-rule px-4 py-1.5 text-sm transition-colors focus:border-amber focus:outline-none"
      />
      {filtered.length === 0 ? (
        <div className="mt-6">
          <p className="text-mist">{t('noResults', { query })}</p>
          <p className="mt-2 text-sm text-mist">
            {t('stillHaveQuestion')}{' '}
            <Link href="/contact" className="text-forest hover:underline">
              {t('getInTouch')}
            </Link>
            .
          </p>
        </div>
      ) : (
        // Explicit user request: two columns, some questions left, some
        // right -- a CSS multi-column flow (not a grid) since these cards
        // have no fixed height, so it naturally balances however many end
        // up in each column rather than forcing equal row heights.
        // break-inside-avoid keeps a single card from splitting across the
        // column break; mb-4 handles item spacing (a multi-column layout's
        // own `gap` is the space between columns, not between stacked
        // items within one).
        <dl className="mt-6 columns-1 gap-4 sm:columns-2 lg:columns-3">
          {filtered.map(({ id, question, answer }) => (
            <FaqCard key={id} question={question} answer={answer} />
          ))}
        </dl>
      )}
    </>
  );
}
