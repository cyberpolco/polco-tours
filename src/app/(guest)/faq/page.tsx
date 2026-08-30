import { cookies } from 'next/headers';
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
        {faqs.length === 0 ? <p className="mt-6 text-mist">{t('noQuestions')}</p> : <FaqList faqs={faqs} />}
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
