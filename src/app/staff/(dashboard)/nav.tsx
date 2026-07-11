'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@prisma/client';
import { can, type Permission } from '@lib/rbac';

const LINKS: { href: string; label: string; permission: Permission }[] = [
  { href: '/staff/bookings', label: 'Bookings', permission: 'booking.read' },
  { href: '/staff/bookings/new', label: 'New booking', permission: 'booking.create' },
  { href: '/staff/fleet', label: 'Fleet', permission: 'fleet.read' },
  { href: '/staff/departures', label: 'Departures', permission: 'assignment.write' },
  { href: '/staff/schedule', label: 'My schedule', permission: 'assignment.read' },
  { href: '/staff/immigration', label: 'Immigration', permission: 'immigration.read' },
  { href: '/staff/admin/officers', label: 'Officers', permission: 'admin.all' },
];

// Client component so usePathname() can drive active-link styling --
// mirrors src/app/(guest)/nav.tsx. Picks the *longest* matching href as
// active (not a plain startsWith per link) so "/staff/bookings/new" doesn't
// also light up the "Bookings" link it's nested under.
//
// `role` filters LINKS down to what this session could actually open --
// needed since the dashboard's baseline gate widened from "holds
// booking.confirm" to "any staff role" (staff-guard.ts): showing every link
// to everyone would dangle ones that 403 for e.g. IMMIGRATION_OFFICER.
export function StaffNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const visibleLinks = LINKS.filter((l) => can(role, l.permission));
  const activeHref = visibleLinks
    .map((l) => l.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex items-center gap-6 text-sm">
      {visibleLinks.map(({ href, label }) => (
        <Link key={href} href={href} className={href === activeHref ? 'text-amber' : 'hover:text-amber'}>
          {label}
        </Link>
      ))}
    </div>
  );
}
