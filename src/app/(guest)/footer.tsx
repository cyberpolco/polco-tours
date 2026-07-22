import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { BrandMark } from '@/components/BrandMark';

// Minimal currentColor glyphs, same hand-drawn convention as BrandMark --
// avoids adding an icon-library dependency for four social links. Empty
// href for now (no accounts set up yet); update in place once they exist.
const SOCIAL_LINKS: { label: string; href: string; path: string }[] = [
  {
    label: 'Facebook',
    href: '#',
    path: 'M14 8.5h2V5.5h-2c-1.66 0-3 1.34-3 3v2H9v3h2v6.5h3V13.5h2.1l.4-3H14v-1c0-.55.45-1 1-1z',
  },
  {
    label: 'Instagram',
    href: '#',
    path: 'M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5zm4 5.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zM17.5 7a1 1 0 1 1-1 1 1 1 0 0 1 1-1z',
  },
  {
    label: 'X',
    href: '#',
    path: 'M4 4l7.2 9.4L4.4 20H7l5.6-6.1L17 20h3l-7.5-9.8L19.5 4H17l-5.2 5.6L7 4H4z',
  },
  {
    label: 'WhatsApp',
    href: '#',
    path: 'M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3zm5.2 12.9c-.2.6-1.2 1.2-1.7 1.3-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.5-.6-2.6-1.1-4.3-3.8-4.4-4-.1-.2-1-1.3-1-2.5s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5.2.5.7 1.8.8 1.9.1.2.1.3 0 .5-.1.2-.2.3-.3.5-.2.2-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.4 1.5.3.1.5.1.6-.1.2-.2.7-.8.9-1.1.2-.3.4-.2.6-.1l1.7.8c.2.1.3.2.4.3.1.2.1.7-.1 1.3z',
  },
];

// Kept honest -- no fabricated contact info (no cleared trademark/business
// registration yet, OI-02/03 in CLAUDE.md), just the brand, real nav links,
// and a legal line. Wired into GuestLayout below <main>.
export async function GuestFooter() {
  const year = new Date().getFullYear();
  const t = await getTranslations('Footer');

  return (
    <footer className="border-t border-rule bg-navy text-bone">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 text-amber">
              <BrandMark className="h-5 w-5" />
              <span className="eyebrow">Polco Tours</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-mist">{t('tagline')}</p>
            <div className="mt-4 flex gap-3">
              {SOCIAL_LINKS.map(({ label, href, path }) => (
                <Link key={label} href={href} aria-label={label} className="text-mist hover:text-amber">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
                    <path d={path} />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
          <nav className="flex flex-col gap-2 text-sm">
            <Link href="/packages" className="hover:text-amber">
              {t('browse')}
            </Link>
            <Link href="/plan-my-trip" className="hover:text-amber">
              {t('planMyTrip')}
            </Link>
            <Link href="/find-booking" className="hover:text-amber">
              {t('findBooking')}
            </Link>
            <Link href="/rate" className="hover:text-amber">
              {t('rateMyTrip')}
            </Link>
            <Link href="/about" className="hover:text-amber">
              {t('about')}
            </Link>
            <Link href="/faq" className="hover:text-amber">
              {t('faq')}
            </Link>
            <Link href="/contact" className="hover:text-amber">
              {t('contact')}
            </Link>
          </nav>
          <p className="eyebrow text-mist">Namibia · DRC</p>
        </div>
        <div className="survey-rule mt-8 opacity-20" />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-mist">&copy; {year} PolCo Tours, a Cyber PolCo Product.</p>
          <div className="flex items-center gap-4 text-xs text-mist">
            <Link href="/terms" className="hover:text-amber">
              {t('terms')}
            </Link>
            <Link href="/staff/login" className="hover:text-amber">
              {t('adminAccess')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
