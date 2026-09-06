import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';
import { VerifyForm } from './verify-form';

// Real per-guest data behind this, not a link-share target -- same
// no-indexing posture as /find-booking/result and the booking wizard pages.
export const metadata: Metadata = { robots: { index: false, follow: false } };

interface Props {
  // The quotation email's CTA carries ?ref=<bookingReference> so the guest
  // only has to type the two factors they actually know by heart. The
  // reference alone proves nothing -- it's printed in the email either way.
  searchParams: Promise<{ ref?: string }>;
}

export default async function CompleteBookingPage({ searchParams }: Props) {
  const { ref } = await searchParams;
  const t = await getTranslations('CompleteBooking');

  return (
    <Reveal>
      <div className="mx-auto max-w-md">
        <p className="eyebrow text-mist">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('verifyTitle')}</h1>
        <p className="mt-2 text-sm text-mist">{t('verifyIntro')}</p>
        <Card className="mt-6">
          <VerifyForm defaultReference={ref?.trim().toUpperCase() ?? ''} />
        </Card>
      </div>
    </Reveal>
  );
}
