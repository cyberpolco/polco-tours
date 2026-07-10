'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/staff/bookings', label: 'Bookings' },
  { href: '/staff/bookings/new', label: 'New booking' },
  { href: '/staff/fleet', label: 'Fleet' },
  { href: '/staff/departures', label: 'Departures' },
];

// Client component so usePathname() can drive active-link styling --
// mirrors src/app/(guest)/nav.tsx. Picks the *longest* matching href as
// active (not a plain startsWith per link) so "/staff/bookings/new" doesn't
// also light up the "Bookings" link it's nested under.
export function StaffNav() {
  const pathname = usePathname();
  const activeHref = LINKS.map((l) => l.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex items-center gap-6 text-sm">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href} className={href === activeHref ? 'text-amber' : 'hover:text-amber'}>
          {label}
        </Link>
      ))}
    </div>
  );
}
