import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Card } from '@/components/ui/Card';
import { Reveal } from '@/components/ui/Reveal';

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Structurally real (two offices, address/email/phone/social rows) but the
// actual values are honest placeholders -- no cleared trademark/business
// registration yet (OI-02/03 in CLAUDE.md), so no fabricated specifics.
// Now staff-editable: intro text (key='contact') and each office's label +
// free-text address/email/phone (keys='contact.office.{namibia,drc}') --
// an office's body is one free-text block rather than 3 structured fields,
// since real registration still isn't cleared; falls back to today's exact
// 3 "pending" lines until staff has real info to enter.
export default async function ContactPage() {
  const t = await getTranslations('Contact');
  const locale = await resolveLocale();
  const [cms, officeNamibia, officeDrc] = await Promise.all([
    cmsService.getPublicTextBlock('contact', locale),
    cmsService.getPublicTextBlock('contact.office.namibia', locale),
    cmsService.getPublicTextBlock('contact.office.drc', locale),
  ]);

  const OFFICES = [
    { key: 'namibia', label: officeNamibia?.title ?? t('namibiaOffice'), body: officeNamibia?.body ?? null },
    { key: 'drc', label: officeDrc?.title ?? t('drcOffice'), body: officeDrc?.body ?? null },
  ] as const;

  return (
    <Reveal>
      <div className="max-w-2xl">
        <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>
        <p className="mt-4 text-mist">{cms?.body ?? t('intro')}</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {OFFICES.map((office) => (
            <Card as="div" key={office.key}>
              <p className="eyebrow text-mist">{office.label}</p>
              {office.body ? (
                <p className="mt-3 whitespace-pre-line text-sm text-mist">{office.body}</p>
              ) : (
                <dl className="mt-3 space-y-1 text-sm text-mist">
                  <div>
                    <dt className="sr-only">Address</dt>
                    <dd>{t('addressPending')}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Email</dt>
                    <dd>{t('emailPending')}</dd>
                  </div>
                  <div>
                    <dt className="sr-only">Phone</dt>
                    <dd>{t('phonePending')}</dd>
                  </div>
                </dl>
              )}
            </Card>
          ))}
        </div>

        <p className="mt-6 text-mist">
          {t('closingLead')}{' '}
          <Link href="/find-booking" className="text-forest hover:underline">
            {t('closingLinkLabel')}
          </Link>
          {t('closingTrail')}
        </p>
      </div>
    </Reveal>
  );
}
