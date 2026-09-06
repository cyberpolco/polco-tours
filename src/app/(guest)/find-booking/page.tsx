import { cookies } from 'next/headers';
import Image from 'next/image';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { Reveal } from '@/components/ui/Reveal';

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Reuses the exact eyebrow/subhead this page already renders -- see
// plan-my-trip/page.tsx's generateMetadata comment for why.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('FindBookingPage');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('find-booking', locale);
  return { title: cms?.eyebrow ?? t('eyebrow'), description: cms?.body ?? t('subhead') };
}

// A plain GET form -- same query-param-driven convention as /quiz. DR-052
// consolidated onto the single, already-public bookingReference (dropped
// the separate confirmationCode secret this used to pair with) -- this is
// explicitly the lower-security "come back later" path, not the active
// in-flight session (see DR-016 plan); rate-limiting on the lookup itself
// is the real remaining defense, same as any real-world "manage my
// booking" page.
export default async function FindBookingPage() {
  const t = await getTranslations('FindBookingPage');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('find-booking', locale);
  return (
    <Reveal>
      {/* This page is otherwise just a two-field lookup form -- explicit
          user request for a large photo behind it, full-bleed (breaking
          out of the page's normal max-w-7xl container) since there's
          little else to fill the section. The existing eyebrow/title/
          subhead/form sit unchanged inside a slightly translucent card on
          top, rather than reworking their colors for on-photo contrast.
          Photo (and the full-bleed breakout itself) is sm+ only -- explicit
          user request: object-cover on this fixed-aspect photo read as
          overstretched/zoomed-in on a phone viewport rather than a
          deliberate backdrop. */}
      <section className="relative flex items-center justify-center overflow-hidden py-16 sm:left-1/2 sm:right-1/2 sm:-mx-[50vw] sm:min-h-[32rem] sm:w-screen sm:px-8">
        <Image
          src="/images/hero/zambezi-sunset-canoe.jpg"
          alt=""
          fill
          priority
          sizes="100vw"
          className="hidden object-cover sm:block"
        />
        <div className="absolute inset-0 hidden bg-ink/25 sm:block" />
        <Card className="relative w-full max-w-md bg-bone/85">
          <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>
          <p className="mt-2 text-sm text-mist">{cms?.body ?? t('subhead')}</p>

          <form method="get" action="/find-booking/result" className="mt-6 space-y-4">
            <FormField label={t('bookingReference')} htmlFor="bookingReference">
              <input name="bookingReference" required className="w-full rounded-survey border border-rule px-3 py-2 uppercase" />
            </FormField>
            <FormField label={t('tourLeadLastName')} htmlFor="lastName">
              <input name="lastName" required className="w-full rounded-survey border border-rule px-3 py-2" />
            </FormField>
            <Button type="submit">{t('submit')}</Button>
          </form>
        </Card>
      </section>
    </Reveal>
  );
}
