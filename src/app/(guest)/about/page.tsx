import { cookies } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Reveal } from '@/components/ui/Reveal';

// DR-071: content is DB-backed (CmsTextBlock, key="about") instead of
// hardcoded JSX -- edited at /staff/cms (renamed from /staff/content,
// DR-162). Reads the same `locale` cookie src/i18n/request.ts does
// directly, rather than pulling in next-intl's machinery for content that
// isn't a next-intl namespace.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

export default async function AboutPage() {
  const locale = await resolveLocale();
  const about = await cmsService.getPublicTextBlock('about', locale);
  const t = await getTranslations('AboutPage');

  return (
    <Reveal>
      <div className="max-w-3xl">
        <p className="eyebrow text-mist">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{about?.title ?? t('defaultTitle')}</h1>
        {about
          ? about.body.split('\n\n').map((paragraph, i) => (
              <p key={i} className="mt-4 text-mist">
                {paragraph}
              </p>
            ))
          : <p className="mt-4 text-mist">{t('contentComingSoon')}</p>}
      </div>
    </Reveal>
  );
}
