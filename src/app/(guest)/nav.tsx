'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const LINKS = [
  { href: '/packages', key: 'browse' },
  { href: '/quiz', key: 'tailorTrip' },
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
