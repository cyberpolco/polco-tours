'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

// "Rate my trip" lives in the footer only (not top-level nav) -- it's a
// post-trip action most guests won't need on every visit, so it doesn't
// compete for space with the wizard-facing top links.
const LINKS = [
  { href: '/packages', key: 'browse' },
  { href: '/plan-my-trip', key: 'planMyTrip' },
  { href: '/gallery', key: 'gallery' },
  { href: '/find-booking', key: 'findBooking' },
  { href: '/about', key: 'about' },
  { href: '/faq', key: 'faq' },
  { href: '/contact', key: 'contact' },
] as const;

// Client component so usePathname() can drive active-link styling --
// GuestLayout itself stays a server component.
export function GuestNav() {
  const pathname = usePathname();
  const t = useTranslations('Nav');

  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {LINKS.map(({ href, key }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? 'text-amber' : 'hover:text-amber'}>
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
