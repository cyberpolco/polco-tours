'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/packages', label: 'Browse' },
  { href: '/quiz', label: 'Tailor my trip' },
  { href: '/find-booking', label: 'Find my booking' },
  { href: '/about', label: 'About' },
  { href: '/faq', label: 'FAQ' },
  { href: '/contact', label: 'Contact' },
];

// Client component so usePathname() can drive active-link styling --
// GuestLayout itself stays a server component.
export function GuestNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {LINKS.map(({ href, label }) => {
        const active = pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={active ? 'text-amber' : 'hover:text-amber'}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
