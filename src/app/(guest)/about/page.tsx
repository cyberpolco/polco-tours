import { cookies } from 'next/headers';
import { contentService, type ContentLocale } from '@modules/content';
import { Reveal } from '@/components/ui/Reveal';

// DR-071: content is now DB-backed (SiteContent, key="about") instead of
// hardcoded JSX -- edited at /staff/content. Reads the same `locale` cookie
// src/i18n/request.ts does directly, rather than pulling in next-intl's
// machinery for content that isn't a next-intl namespace.
async function resolveLocale(): Promise<ContentLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

export default async function AboutPage() {
  const locale = await resolveLocale();
  const about = await contentService.getPublicSiteContent('about', locale);

  return (
    <Reveal>
      <div className="max-w-3xl">
        <p className="eyebrow text-mist">About</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{about?.title ?? 'About Polco Tours'}</h1>
        {about
          ? about.body.split('\n\n').map((paragraph, i) => (
              <p key={i} className="mt-4 text-mist">
                {paragraph}
              </p>
            ))
          : <p className="mt-4 text-mist">Content coming soon.</p>}
      </div>
    </Reveal>
  );
}
