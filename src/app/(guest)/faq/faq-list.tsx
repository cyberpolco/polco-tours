'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CmsFaqEntryView } from '@modules/cms';
import { Card } from '@/components/ui/Card';

interface Props {
  faqs: CmsFaqEntryView[];
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
            <Card as="div" key={id} className="mb-4 break-inside-avoid">
              <dt className="font-semibold text-navy">{question}</dt>
              <dd className="mt-2 text-sm text-mist">{answer}</dd>
            </Card>
          ))}
        </dl>
      )}
    </>
  );
}
