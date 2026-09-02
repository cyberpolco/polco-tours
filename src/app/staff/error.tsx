'use client';

import { useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Button, LinkButton } from '@/components/ui/Button';

// Sits directly under src/app/staff/ (outside the (dashboard) route group)
// so it also catches an error thrown by (dashboard)/layout.tsx itself
// (e.g. requireStaffContext failing unexpectedly) -- same reasoning
// /staff/forbidden and /staff/login already sit outside that group for.
// Full-screen dark treatment, same convention as forbidden/login/
// change-password rather than the light dashboard chrome, since the
// dashboard shell may not have mounted at all when this fires.
export default function StaffError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations('StaffError');
  const tChrome = useTranslations('StaffChrome');

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="staff-shell flex min-h-screen items-center justify-center bg-navy px-8 text-bone">
      <div className="max-w-sm text-center">
        <p className="mb-2 text-xs font-semibold tracking-survey text-amber">{tChrome('brandEyebrow')}</p>
        <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
        <p className="text-mist">{t('body')}</p>
        {error.digest ? (
          <p className="mt-2 font-mono text-xs text-mist/70">
            {t('digest')}: {error.digest}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button variant="invert" onClick={reset}>
            {t('tryAgain')}
          </Button>
          <LinkButton href="/staff/profile" variant="invertOutline">
            {t('goToDashboard')}
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
