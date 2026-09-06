import { cookies } from 'next/headers';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { cmsService, type CmsLocale } from '@modules/cms';
import { Card } from '@/components/ui/Card';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { ArrowRightIcon, MailIcon, MapPinIcon, QuestionIcon, StarOutlineIcon, TicketIcon } from './contact-icons';
import { ContactBody } from './linkify-contact';
import { ContactForm } from './ContactForm';

// Same direct-cookie-read convention as (guest)/about/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Reuses the exact eyebrow/intro this page already renders -- see
// plan-my-trip/page.tsx's generateMetadata comment for why.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Contact');
  const locale = await resolveLocale();
  const cms = await cmsService.getPublicTextBlock('contact', locale);
  return { title: cms?.eyebrow ?? t('eyebrow'), description: cms?.body ?? t('intro') };
}

// Two offices, real staff-entered address/email/phone (OI-02/03 resolved
// DR-199 -- Lam's per-market legal registration documents are in hand, and
// the guest-facing "Mufasa Safaris & Tours" / staff-portal "POLCO Tours"
// name split is confirmed permanent, so there's no more trademark/
// registration gating on publishing real specifics here). Staff-editable at
// /staff/cms (SUPERADMIN-only writes, PageTextEditor): intro text
// (key='contact'), each office's label + free-text address/email/phone
// (keys='contact.office.{namibia,drc}') -- an office's body stays one
// free-text block rather than 3 structured fields for flexibility (hours,
// a second phone line, etc.), not because there's anything left to avoid
// fabricating -- and, added alongside this redesign, a third optional
// free-text block (key='contact.general') for a catch-all channel (e.g. a
// general email/WhatsApp number/hours) that isn't tied to either office;
// hidden entirely until staff actually fills it in. The quick-links row
// below routes guests to the app's other self-serve pages instead of
// waiting on a reply -- pure navigation, no CMS involvement, same idea as
// the existing closing-line link to /find-booking.
export default async function ContactPage() {
  const t = await getTranslations('Contact');
  const locale = await resolveLocale();
  const [cms, officeNamibia, officeDrc, general] = await Promise.all([
    cmsService.getPublicTextBlock('contact', locale),
    cmsService.getPublicTextBlock('contact.office.namibia', locale),
    cmsService.getPublicTextBlock('contact.office.drc', locale),
    cmsService.getPublicTextBlock('contact.general', locale),
  ]);

  const OFFICES = [
    { key: 'namibia', label: officeNamibia?.title ?? t('namibiaOffice'), body: officeNamibia?.body ?? null },
    { key: 'drc', label: officeDrc?.title ?? t('drcOffice'), body: officeDrc?.body ?? null },
  ] as const;

  const QUICK_LINKS = [
    { key: 'findBooking', href: '/find-booking', icon: TicketIcon, title: t('quickFindBookingTitle'), body: t('quickFindBookingBody') },
    { key: 'faq', href: '/faq', icon: QuestionIcon, title: t('quickFaqTitle'), body: t('quickFaqBody') },
    { key: 'rate', href: '/rate', icon: StarOutlineIcon, title: t('quickRateTitle'), body: t('quickRateBody') },
  ] as const;

  return (
    <Reveal>
      <div>
        <p className="eyebrow text-mist">{cms?.eyebrow ?? t('eyebrow')}</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{cms?.title ?? t('title')}</h1>
        <p className="mt-4 max-w-2xl text-mist">{cms?.body ?? t('intro')}</p>

        {/* Full width, matching the quick-links and offices grids below --
            the intro paragraph above keeps its own narrower measure, since
            that's prose and this is a form. */}
        <div className="mt-8">
          <ContactForm />
        </div>

        <h2 className="eyebrow mt-10 text-forest">{t('quickLinksEyebrow')}</h2>
        <RevealGroup className="mt-3 grid gap-4 sm:grid-cols-3" itemClassName="h-full">
          {QUICK_LINKS.map(({ key, href, icon: Icon, title, body }) => (
            <Link key={key} href={href} className="group block h-full">
              <Card as="div" interactive className="flex h-full flex-col gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-forest/10 text-forest">
                  <Icon />
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-navy">{title}</p>
                  <p className="mt-1 text-sm text-mist">{body}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-forest">
                  {t('quickLinkCta')}
                  <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </span>
              </Card>
            </Link>
          ))}
        </RevealGroup>

        <h2 className="eyebrow mt-10 text-forest">{t('officesEyebrow')}</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {OFFICES.map((office) => (
            <Card as="div" key={office.key} interactive className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber/10 text-amber">
                  <MapPinIcon />
                </span>
                <p className="eyebrow text-mist">{office.label}</p>
              </div>
              {office.body ? (
                <ContactBody text={office.body} />
              ) : (
                <dl className="space-y-1 text-sm text-mist">
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

          {general?.title && general.body && (
            <Card as="div" interactive className="flex flex-col gap-3 sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-forest/10 text-forest">
                  <MailIcon />
                </span>
                <p className="eyebrow text-mist">{general.title}</p>
              </div>
              <ContactBody text={general.body} />
            </Card>
          )}
        </div>
      </div>
    </Reveal>
  );
}
