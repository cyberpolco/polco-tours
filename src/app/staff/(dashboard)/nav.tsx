'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@prisma/client';
import type { Permission } from '@lib/rbac';

const LINKS: { href: string; label: string; permission: Permission; superadminOnly?: boolean }[] = [
  { href: '/staff/insights', label: 'Insights', permission: 'insights.read' },
  { href: '/staff/tracking', label: 'Tracking', permission: 'tracking.read' },
  { href: '/staff/bookings', label: 'Bookings', permission: 'booking.read' },
  { href: '/staff/bookings/new', label: 'New booking', permission: 'booking.create' },
  { href: '/staff/quote-requests', label: 'Quote requests', permission: 'booking.read' },
  { href: '/staff/packages', label: 'Packages', permission: 'catalog.read' },
  { href: '/staff/fleet', label: 'Fleet', permission: 'fleet.read' },
  { href: '/staff/itineraries', label: 'Itineraries', permission: 'itinerary.write' },
  { href: '/staff/hotels', label: 'Hotels', permission: 'itinerary.write' },
  { href: '/staff/restaurants', label: 'Restaurants', permission: 'itinerary.write' },
  { href: '/staff/schedule', label: 'My schedule', permission: 'assignment.read' },
  { href: '/staff/visa-queue', label: 'Visa queue', permission: 'visa.process' },
  { href: '/staff/country-regulations', label: 'Country regulations', permission: 'country_regulation.read' },
  { href: '/staff/ratings', label: 'Ratings', permission: 'rating.read' },
  { href: '/staff/finance/rates', label: 'Operational Rates', permission: 'finance_config.read' },
  { href: '/staff/admin/users', label: 'Users', permission: 'admin.all' },
  // DR-035: SUPERADMIN-only regardless of who else holds admin.all --
  // PLATFORM_ADMIN is seeded with admin.all by default but must NOT see
  // this link, matching the page's own explicit SUPERADMIN-only gate.
  { href: '/staff/admin/permissions', label: 'Permissions', permission: 'admin.all', superadminOnly: true },
];

// Client component so usePathname() can drive active-link styling --
// mirrors src/app/(guest)/nav.tsx. Picks the *longest* matching href as
// active (not a plain startsWith per link) so "/staff/bookings/new" doesn't
// also light up the "Bookings" link it's nested under.
//
// `roles`/`permissions` filter LINKS down to what this session could
// actually open -- needed since the dashboard's baseline gate widened from
// "holds booking.confirm" to "any staff role" (staff-guard.ts): showing
// every link to everyone would dangle ones that 403 for a role lacking that
// permission. Takes the already-resolved permission set as a plain prop
// (DR-035) rather than importing rbac.ts's can() -- a client component
// can't await the DB-backed resolution can() now depends on for non-
// SUPERADMIN roles, so the tiny wildcard-or-lookup check is duplicated
// locally instead; the parent server layout already did the real
// resolution once, in resolveSession.
export function StaffNav({ roles, permissions }: { roles: Role[]; permissions: Permission[] }) {
  const pathname = usePathname();
  const isSuperadmin = roles.includes('SUPERADMIN');
  const permissionSet = new Set(permissions);
  const visibleLinks = LINKS.filter((l) => {
    if (l.superadminOnly) return isSuperadmin;
    return isSuperadmin || permissionSet.has(l.permission);
  });
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
