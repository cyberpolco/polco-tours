import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Reveal } from '@/components/ui/Reveal';

// Honest placeholder -- no trademark/business registration cleared yet
// (OI-02/03 in CLAUDE.md), so no real terms-of-service/policy text is
// fabricated here, same convention as the Contact page. Merged with the
// former standalone /policies page (privacy/cancellation/refund) into one
// page, since both were placeholders with nothing to actually keep separate
// yet -- /policies is removed entirely, not redirected (nothing else in the
// app linked to it besides the footer, updated in the same change).
export default async function TermsPage() {
  const t = await getTranslations('Terms');

  return (
    <Reveal>
      <div className="max-w-2xl">
        <p className="eyebrow text-mist">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('title')}</h1>
        <p className="mt-4 text-mist">{t('body')}</p>
        <p className="mt-4 text-mist">
          {t('questionsLead')}{' '}
          <Link href="/contact" className="text-forest hover:underline">
            {t('linkLabel')}
          </Link>
          .
        </p>
      </div>
    </Reveal>
  );
}
