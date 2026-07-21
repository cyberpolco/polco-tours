'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@prisma/client';
import type { Permission } from '@lib/rbac';

interface NavLink {
  href: string;
  label: string;
  // Exactly one of these is set: a single-permission link, or an aggregate
  // link (Settings/Content, DR-042/043) visible if the caller holds ANY of
  // several underlying permissions -- the sub-pages it points into each
  // keep their own existing, narrower permission unchanged.
  permission?: Permission;
  anyOfPermissions?: Permission[];
  superadminOnly?: boolean;
  // For an aggregate link: which pathname prefixes count as "active" here,
  // since its own href is just the first sub-page (its own href wouldn't
  // otherwise match while viewing e.g. /staff/insights).
  activeHrefPrefixes?: string[];
}

const LINKS: NavLink[] = [
  { href: '/staff/tracking', label: 'Tracking', permission: 'tracking.read' },
  { href: '/staff/bookings', label: 'Bookings', permission: 'booking.read' },
  { href: '/staff/bookings/new', label: 'New booking', permission: 'booking.create' },
  { href: '/staff/packages', label: 'Packages', permission: 'catalog.read' },
  { href: '/staff/fleet', label: 'Fleet', permission: 'fleet.read' },
  { href: '/staff/itineraries', label: 'Itineraries', permission: 'itinerary.write' },
  { href: '/staff/hotels', label: 'Hotels', permission: 'itinerary.write' },
  { href: '/staff/restaurants', label: 'Restaurants', permission: 'itinerary.write' },
  { href: '/staff/schedule', label: 'My schedule', permission: 'assignment.read' },
  { href: '/staff/visa-queue', label: 'Visa queue', permission: 'visa.process' },
  { href: '/staff/ratings', label: 'Ratings', permission: 'rating.read' },
  // Settings (DR-042): reorganizes 5 pre-existing tabs (Country
  // Regulations, Operational Rates, Insights, Users, Permissions -- URLs
  // unchanged) plus 2 new pages (Tax Rates, Platform Rate) into a left
  // vertical sub-nav (SidebarShell), reached from this one aggregate link.
  {
    href: '/staff/settings/tax-rates',
    label: 'Settings',
    anyOfPermissions: [
      'platform_settings.read',
      'country_regulation.read',
      'finance_config.read',
      'insights.read',
      'admin.all',
    ],
    activeHrefPrefixes: [
      '/staff/settings',
      '/staff/country-regulations',
      '/staff/finance/rates',
      '/staff/insights',
      '/staff/admin/users',
      '/staff/admin/permissions',
      '/staff/change-password',
      '/staff/profile',
    ],
  },
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
    if (l.anyOfPermissions) return isSuperadmin || l.anyOfPermissions.some((p) => permissionSet.has(p));
    return isSuperadmin || (l.permission != null && permissionSet.has(l.permission));
  });
  // Longest matching prefix wins, same "don't also light up the parent"
  // reasoning as before -- an aggregate link's activeHrefPrefixes (if any)
  // replace its own href as the set of prefixes to test against.
  const activeHref = visibleLinks
    .flatMap((l) => (l.activeHrefPrefixes ?? [l.href]).map((prefix) => ({ href: l.href, prefix })))
    .filter(({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0]?.href;

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
