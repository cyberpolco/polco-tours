import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Reveal } from '@/components/ui/Reveal';

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
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
      <div>
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
      </div>
    </Reveal>
  );
}
