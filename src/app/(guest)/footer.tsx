import { Fragment } from 'react';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { cmsService, CMS_SOCIAL_PLATFORM_LABELS, type CmsLocale, type CmsSocialPlatform } from '@modules/cms';
import { Logo } from '@/components/Logo';

// Same direct-cookie-read convention as (guest)/about/page.tsx and
// (guest)/contact/page.tsx.
async function resolveLocale(): Promise<CmsLocale> {
  const store = await cookies();
  return store.get('locale')?.value === 'fr' ? 'fr' : 'en';
}

// Shown until staff sets a real line at /staff/cms's Footer legal tab
// (DR-204, whole-line template since DR-214) -- same "degrade to the
// original hardcoded value" convention as FALLBACK_SOCIAL_LINKS below.
// `{year}`/`{link}` are the two live placeholders `renderFooterLegalLine`
// substitutes at render time -- `{year}` is never stored, always the real
// current year, so the line can never go stale even though staff can edit
// every word around it (including the brand name, deliberately, per
// explicit user direction -- a one-line, scoped exception to DR-168's
// otherwise-fixed brand text, not a reversal of it elsewhere).
const FALLBACK_FOOTER_LEGAL_TEMPLATE = '© {year} Mufasa Safaris & Tours, a {link} Product.';
const FALLBACK_FOOTER_LEGAL_LABEL = 'Cyber PolCo';
const FALLBACK_FOOTER_LEGAL_URL = 'https://www.cyberpolco.com';

interface FooterLegalContent {
  template: string;
  label: string;
  url: string;
}

async function getFooterLegalContent(locale: CmsLocale): Promise<FooterLegalContent> {
  try {
    const block = await cmsService.getPublicTextBlock('footer.legal', locale);
    if (block?.title && block.body) {
      return {
        template: block.eyebrow?.trim() || FALLBACK_FOOTER_LEGAL_TEMPLATE,
        label: block.title,
        url: block.body,
      };
    }
    return { template: FALLBACK_FOOTER_LEGAL_TEMPLATE, label: FALLBACK_FOOTER_LEGAL_LABEL, url: FALLBACK_FOOTER_LEGAL_URL };
  } catch {
    return { template: FALLBACK_FOOTER_LEGAL_TEMPLATE, label: FALLBACK_FOOTER_LEGAL_LABEL, url: FALLBACK_FOOTER_LEGAL_URL };
  }
}

// Splits the staff-authored template on its two placeholder tokens and
// interleaves the live year + the actual link element -- plain text nodes
// (React-escaped, never dangerouslySetInnerHTML) so a staff typo can't
// inject markup.
function renderFooterLegalLine(content: FooterLegalContent, year: number) {
  const parts = content.template.split(/(\{year\}|\{link\})/g).filter((part) => part !== '');
  return parts.map((part, index) => {
    if (part === '{link}') {
      return (
        <a
          key={`link-${index}`}
          href={content.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-bold text-mist no-underline transition-colors duration-200 hover:text-amber"
        >
          {content.label}
        </a>
      );
    }
    return <Fragment key={`text-${index}`}>{part === '{year}' ? year : part}</Fragment>;
  });
}

// Minimal currentColor glyphs, same hand-drawn convention as BrandMark --
// avoids adding an icon-library dependency for these social links. Keyed
// by platform (DR-200) so a staff-configured CmsMediaItem row (page=
// 'social-links') can pick the right glyph without storing icon markup in
// the DB -- adding a 6th platform is still a code change here, not a
// staff-configurable one (see CMS_SOCIAL_PLATFORMS in the cms module).
const SOCIAL_ICON_PATHS: Record<CmsSocialPlatform, string> = {
  facebook: 'M14 8.5h2V5.5h-2c-1.66 0-3 1.34-3 3v2H9v3h2v6.5h3V13.5h2.1l.4-3H14v-1c0-.55.45-1 1-1z',
  instagram: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm4 5.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zM17.5 7a1 1 0 1 1-1 1 1 1 0 0 1 1-1z',
  x: 'M4 4l7.2 9.4L4.4 20H7l5.6-6.1L17 20h3l-7.5-9.8L19.5 4H17l-5.2 5.6L7 4H4z',
  whatsapp:
    'M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm5.2 12.9c-.2.6-1.2 1.2-1.7 1.3-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.3-1-2.5s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1l1.7.8c.2.1.3.2.4.3.1.2.1.7-.1 1.3z',
  tiktok: 'M16.6 3h-3v12.2a2.8 2.8 0 1 1-2-2.7v-3.1a5.9 5.9 0 1 0 5 5.8V9.3a7.7 7.7 0 0 0 4.4 1.4V7.6a4.6 4.6 0 0 1-4.4-4.6z',
};

// Shown until staff configures real accounts from /staff/cms's Social
// links tab (DR-200) -- href '#' placeholder, same "no accounts set up
// yet" convention the old hardcoded array used.
const FALLBACK_SOCIAL_LINKS: { platform: CmsSocialPlatform; href: string }[] = (
  ['facebook', 'instagram', 'x', 'whatsapp', 'tiktok'] as const
).map((platform) => ({ platform, href: '#' }));

async function getSocialLinks(): Promise<{ platform: CmsSocialPlatform; href: string }[]> {
  try {
    const items = await cmsService.listPublicMediaItems('social-links');
    const configured = items
      .filter((item): item is typeof item & { platform: CmsSocialPlatform; url: string } => Boolean(item.platform && item.url))
      .map((item) => ({ platform: item.platform, href: item.url }));
    return configured.length > 0 ? configured : FALLBACK_SOCIAL_LINKS;
  } catch {
    // Degrade to the placeholder set rather than failing the footer render
    // (charter rule 8's graceful-degradation spirit, applied to our own DB
    // read the same way it applies to a third-party integration).
    return FALLBACK_SOCIAL_LINKS;
  }
}

// Kept honest -- no fabricated contact info (no cleared trademark/business
// registration yet, OI-02/03 in CLAUDE.md), just the brand, real nav links,
// and a legal line. Wired into GuestLayout below <main>.
export async function GuestFooter() {
  const year = new Date().getFullYear();
  const t = await getTranslations('Footer');
  const locale = await resolveLocale();
  const [socialLinks, footerLegal] = await Promise.all([getSocialLinks(), getFooterLegalContent(locale)]);

  return (
    <footer className="border-t border-rule bg-navy text-bone">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 text-amber">
              <Logo className="h-10 w-10 sm:h-20 sm:w-20" />
              <span className="eyebrow">Mufasa Safaris & Tours</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-mist">{t('tagline')}</p>
            <div className="mt-4 flex gap-3">
              {socialLinks.map(({ platform, href }) => (
                <Link key={platform} href={href} aria-label={CMS_SOCIAL_PLATFORM_LABELS[platform]} className="text-mist hover:text-amber">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d={SOCIAL_ICON_PATHS[platform]} />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/packages" prefetch={false} className="hover:text-amber">
              {t('browse')}
            </Link>
            <Link href="/plan-my-trip" prefetch={false} className="hover:text-amber">
              {t('planMyTrip')}
            </Link>
            <Link href="/find-booking" prefetch={false} className="hover:text-amber">
              {t('findBooking')}
            </Link>
            <Link href="/rate" prefetch={false} className="hover:text-amber">
              {t('rateMyTrip')}
            </Link>
            <Link href="/weather" prefetch={false} className="hover:text-amber">
              {t('weather')}
            </Link>
            <Link href="/about" prefetch={false} className="hover:text-amber">
              {t('about')}
            </Link>
            <Link href="/faq" prefetch={false} className="hover:text-amber">
              {t('faq')}
            </Link>
            <Link href="/contact" prefetch={false} className="hover:text-amber">
              {t('contact')}
            </Link>
          </nav>
          <p className="eyebrow text-mist">Namibia · DRC</p>
        </div>
        <div className="survey-rule mt-8 opacity-20" />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-mist">{renderFooterLegalLine(footerLegal, year)}</p>
          <div className="flex items-center gap-4 text-xs text-mist">
            <Link href="/terms" prefetch={false} className="hover:text-amber">
              {t('terms')}
            </Link>
            <Link href="/staff/login" prefetch={false} className="hover:text-amber">
              {t('adminAccess')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
