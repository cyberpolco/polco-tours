import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Reveal } from '@/components/ui/Reveal';
import { FaqList } from './faq-list';

// DR-071: FAQ list is DB-backed (CmsFaqEntry) instead of a hardcoded array
// -- edited at /staff/cms (renamed from /staff/content, DR-162). Same
// direct-cookie-read convention as about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// FaqPage's own eyebrow/title aren't cms-overridable (only the entries
// themselves are, via CmsFaqEntry) -- title reuses the page's own i18n
// heading verbatim. Description borrows Contact's quickFaqBody -- already
// on this site describing this exact page ("Common questions about
// bookings, payments, and travel"), rather than writing a second, separate
// line that could drift from it.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('FaqPage');
  const tContact = await getTranslations('Contact');
  return { title: t('title'), description: tContact('quickFaqBody') };
}

export default async function FaqPage() {
  const locale = await resolveLocale();
  const faqs = await cmsService.listPublicFaqEntries(locale);
  const t = await getTranslations('FaqPage');

  return (
    <Reveal>
      <div>
        <p className="eyebrow text-mist">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('title')}</h1>

        {/* Full-bleed hero photo behind the search box + question cards
            (not the title above) -- explicit user request. Breaks out of
            the page's normal max-w-7xl container; the cards themselves
            (faq-list.tsx's FaqCard) are given a slightly translucent
            background so the photo shows through behind them. Photo (and
            the full-bleed breakout itself) is sm+ only -- explicit user
            request: object-cover on this fixed-aspect photo read as
            overstretched/zoomed-in on a phone viewport rather than a
            deliberate backdrop. */}
        <section className="relative mt-6 overflow-hidden py-10 sm:left-1/2 sm:right-1/2 sm:-mx-[50vw] sm:w-screen sm:px-8">
          <Image
            src="/images/hero/faq-hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="hidden object-cover sm:block"
          />
          <div className="absolute inset-0 hidden bg-ink/10 sm:block" />
          <div className="relative mx-auto max-w-7xl">
            {faqs.length === 0 ? <p className="text-mist">{t('noQuestions')}</p> : <FaqList faqs={faqs} />}
          </div>
        </section>

        <p className="mt-6 max-w-3xl text-sm text-mist">
          {t('stillHaveQuestion')}{' '}
          <Link href="/contact" className="text-forest hover:underline">
            {t('getInTouch')}
          </Link>
          .
        </p>
      </div>
    </Reveal>
  );
}
