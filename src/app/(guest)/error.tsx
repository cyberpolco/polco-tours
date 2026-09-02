'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button, LinkButton } from '@/components/ui/Button';

// Route-group error boundary (Next.js convention) -- catches anything
// thrown rendering a guest page/action below (guest)/layout.tsx, so the
// header/nav/footer chrome stays mounted and the tourist never loses their
// way back to a working page. Does NOT catch an error thrown by
// (guest)/layout.tsx itself (Next.js boundary rule) -- that's unstyled by
// design, this file's only job is the common case: a page/action failing.
export default function GuestError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('GuestError');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-lg text-center">
        <p className="eyebrow text-amber">{t('eyebrow')}</p>
        <h1 className="mt-2 text-3xl font-bold text-navy">{t('title')}</h1>
        <p className="mt-4 text-mist">{t('body')}</p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-mist/70">
            {t('digest')}: {error.digest}
          </p>
        ) : null}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="primary" onClick={reset}>
            {t('tryAgain')}
          </Button>
          <LinkButton href="/" variant="secondary">
            {t('goHome')}
          </LinkButton>
          <Link href="/contact" className="text-sm font-semibold text-navy underline underline-offset-4">
            {t('contactUs')}
          </Link>
        </div>
      </div>
    </div>
  );
}
