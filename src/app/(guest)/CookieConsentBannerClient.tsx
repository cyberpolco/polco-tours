'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { setCookieConsentAction } from '@lib/set-cookie-consent-action';
import type { CookieConsentChoice } from '@lib/cookie-consent';

// DR-207: router.refresh() (not a full reload) re-runs the server
// component above this one, which re-reads the now-written cookie and
// stops rendering the banner -- the write already happened server-side by
// the time this resolves, refresh() just syncs the tree to it.
export function CookieConsentBannerClient() {
  const t = useTranslations('CookieConsent');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function choose(choice: CookieConsentChoice) {
    startTransition(async () => {
      await setCookieConsentAction(choice);
      router.refresh();
    });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-rule bg-navy px-4 py-4 text-bone sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-bone/90">
          {t('message')}{' '}
          <Link href="/terms?tab=cookies" className="underline hover:text-amber">
            {t('learnMore')}
          </Link>
        </p>
        <div className="flex gap-3">
          <Button variant="invertOutline" size="compact" disabled={isPending} onClick={() => choose('rejected')}>
            {t('reject')}
          </Button>
          <Button variant="invert" size="compact" disabled={isPending} onClick={() => choose('accepted')}>
            {t('accept')}
          </Button>
        </div>
      </div>
    </div>
  );
}
