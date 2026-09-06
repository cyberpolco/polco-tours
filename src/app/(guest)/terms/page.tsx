import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Reveal } from '@/components/ui/Reveal';

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

const TABS = ['tos', 'privacy', 'cookies', 'cancellation'] as const;
type TabKey = (typeof TABS)[number];

interface Props {
  searchParams: Promise<{ tab?: string }>;
}

// Same title regardless of ?tab= -- a shared link to /terms shouldn't read
// differently per tab. Description is the Terms of Service section's own
// opening sentence (cms override, i18n default, same as the page body
// itself) -- the one paragraph on this page that actually introduces the
// company, rather than new copy written just for this.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Terms');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('terms.tos', locale);
  const body = cms?.body ?? t('sections.tos.body');
  return { title: t('title'), description: body.split('\n\n')[0] };
}

// DR-207: real content, in 4 sections tabbed via a plain ?tab= query param
// -- same real-navigation, no-client-JS convention as /staff/cms (DR-165).
// Each tab is its own CmsTextBlock (terms.tos/terms.privacy/terms.cookies/
// terms.cancellation, staff-editable from /staff/cms's Terms tab), with a
// coded EN/FR default in messages/en.json+fr.json as the fallback -- same
// "CMS override, i18n default" convention every other guest page already
// uses. Replaces the old single flat 'terms' key, which was a deliberate
// empty placeholder (no trademark/business registration cleared yet,
// OI-02/03) -- DR-199 (2026-08-30) resolved both, so real content is
// written directly into the message catalogs below rather than left empty.
export default async function TermsPage({ searchParams }: Props) {
  const { tab } = await searchParams;
  const activeTab: TabKey = (TABS as readonly string[]).includes(tab ?? '') ? (tab as TabKey) : 'tos';
  const t = await getTranslations('Terms');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock(`terms.${activeTab}`, locale);

  return (
    <Reveal>
      <div>
        <p className="eyebrow text-mist">{t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{t('title')}</h1>

        <nav className="mt-6 flex flex-wrap gap-2 border-b border-rule pb-3">
          {TABS.map((key) => (
            <Link
              key={key}
              href={`/terms?tab=${key}`}
              prefetch={false}
              className={`rounded-pill px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab === key ? 'bg-navy text-bone' : 'text-mist hover:bg-rule/40 hover:text-navy'
              }`}
            >
              {t(`tabs.${key}`)}
            </Link>
          ))}
        </nav>

        <div className="mt-6 max-w-3xl">
          <h2 className="text-xl font-bold text-navy">{cms?.title ?? t(`sections.${activeTab}.title`)}</h2>
          <p className="mt-4 whitespace-pre-line text-mist">{cms?.body ?? t(`sections.${activeTab}.body`)}</p>
        </div>

        <p className="mt-8 text-mist">
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
