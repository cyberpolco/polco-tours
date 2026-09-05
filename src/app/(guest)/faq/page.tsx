import { cookies } from 'next/headers';
import Image from 'next/image';
import Link from 'next/link';
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
            background so the photo shows through behind them. */}
        <section className="relative left-1/2 right-1/2 -mx-[50vw] mt-6 w-screen overflow-hidden px-4 py-10 sm:px-8">
          <Image
            src="/images/hero/faq-hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="absolute inset-0 bg-ink/10" />
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
