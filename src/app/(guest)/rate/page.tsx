import { cookies } from 'next/headers';
import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Alert } from '@/components/ui/Alert';
import { Reveal } from '@/components/ui/Reveal';

interface Props {
  searchParams: Promise<{ submitted?: string }>;
}

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Customer Ratings & Feedback (DR-037) -- same plain-GET-form, no-session
// convention as /find-booking. A client rates using their Booking
// Reference + the single-use Rating Code staff issued once their booking
// was fully paid.
export default async function RatePage({ searchParams }: Props) {
  const { submitted } = await searchParams;
  const t = await getTranslations('RatePage');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('rate', locale);

  return (
    <Reveal>
      {/* Same full-bleed photo treatment as /find-booking (explicit user
          request) -- these two pages are the same shape: a short
          two-field, no-session lookup form with little else to fill the
          section. Everything stays inside a slightly translucent card
          rather than being recolored for contrast against the photo. */}
      <section className="relative left-1/2 right-1/2 -mx-[50vw] flex min-h-[26rem] w-screen items-center justify-center overflow-hidden px-4 py-16 sm:min-h-[32rem] sm:px-8">
        <Image src="/images/hero/etosha-zebra-waterhole.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-ink/25" />
        <Card className="relative w-full max-w-md bg-bone/85">
          <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>

          {submitted && (
            <div className="mt-4">
              <Alert tone="success">{t('thankYou')}</Alert>
            </div>
          )}

          <p className="mt-2 text-sm text-mist">{cms?.body ?? t('subhead')}</p>

          <form method="get" action="/rate/result" className="mt-6 space-y-4">
            <FormField label={t('bookingReference')} htmlFor="bookingReference">
              <input
                name="bookingReference"
                required
                className="w-full rounded-survey border border-rule px-3 py-2 uppercase"
              />
            </FormField>
            <FormField label={t('ratingCode')} htmlFor="ratingCode">
              <input name="ratingCode" required className="w-full rounded-survey border border-rule px-3 py-2 uppercase" />
            </FormField>
            <Button type="submit">{t('continueLabel')}</Button>
          </form>
        </Card>
      </section>
    </Reveal>
  );
}
