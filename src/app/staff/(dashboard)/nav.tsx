'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import type { Permission } from '@lib/rbac';
import { MenuGlyph } from '@/components/ui/MenuGlyph';

interface NavLink {
  href: string;
  labelKey: string;
  // Exactly one of these is set: a single-permission link, or an aggregate
  // link (Settings/Content, DR-042/043) visible if the caller holds ANY of
  // several underlying permissions -- the sub-pages it points into each
  // keep their own existing, narrower permission unchanged.
  permission?: Permission;
  anyOfPermissions?: Permission[];
  superadminOnly?: boolean;
  // New Booking (manual staff-entered bookings): narrower than
  // `booking.create` itself, which TOURIST/PLATFORM_ADMIN also hold for
  // unrelated reasons (guest checkout; general staff grants) -- per
  // explicit user direction, only SUPERADMIN and TOUR_OPERATOR should see
  // or use this page at all.
  requiresAnyRole?: Role[];
  // For an aggregate link: which pathname prefixes count as "active" here,
  // since its own href is just the first sub-page (its own href wouldn't
  // otherwise match while viewing e.g. /staff/insights).
  activeHrefPrefixes?: string[];
}

const LINKS: NavLink[] = [
  { href: '/staff/bookings', labelKey: 'bookings', permission: 'booking.read' },
  { href: '/staff/bookings/new', labelKey: 'newBooking', requiresAnyRole: ['TOUR_OPERATOR'] },
  { href: '/staff/packages', labelKey: 'packages', permission: 'catalog.read' },
  { href: '/staff/fleet', labelKey: 'fleet', permission: 'fleet.read' },
  { href: '/staff/itineraries', labelKey: 'itineraries', permission: 'itinerary.write' },
  // DR-083: also visible to TOUR_GUIDE/DRIVER (hotel_restaurant_rating.write,
  // no itinerary.write) -- they now rate a hotel/restaurant from its own
  // profile page rather than the itinerary page, so they need a way in.
  {
    href: '/staff/hotels',
    labelKey: 'hotels',
    anyOfPermissions: ['itinerary.write', 'hotel_restaurant_rating.write'],
  },
  {
    href: '/staff/restaurants',
    labelKey: 'restaurants',
    anyOfPermissions: ['itinerary.write', 'hotel_restaurant_rating.write'],
  },
  { href: '/staff/schedule', labelKey: 'mySchedule', permission: 'assignment.read' },
  { href: '/staff/visa-queue', labelKey: 'visaQueue', permission: 'visa.process' },
  { href: '/staff/tracking', labelKey: 'tracking', permission: 'tracking.read' },
  // DR-089: deliberately itinerary.read, not itinerary.write (unlike the
  // "Itineraries" link above) -- TOUR_GUIDE/DRIVER's first nav-level entry
  // point into itinerary data; before this they could only reach a day's
  // detail by direct URL.
  { href: '/staff/map', labelKey: 'map', permission: 'itinerary.read' },
  { href: '/staff/ratings', labelKey: 'ratings', permission: 'rating.read' },
  // Settings (DR-042): reorganizes 5 pre-existing tabs (Country
  // Regulations, Operational Rates, Insights, Users, Permissions -- URLs
  // unchanged) plus 2 new pages (Tax Rates, Platform Rate) into a left
  // vertical sub-nav (SidebarShell), reached from this one aggregate link.
  // DR-123: lands on the new Finance hub rather than Tax Rates directly --
  // Tax Rates dropped out of SETTINGS_ITEMS (now reached via the Finance
  // card hub instead), so it's no longer a valid "first tab" landing page.
  {
    href: '/staff/settings/finance',
    labelKey: 'settings',
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
  const t = useTranslations('StaffNav');
  const [open, setOpen] = useState(false);
  const isSuperadmin = roles.includes('SUPERADMIN');
  const permissionSet = new Set(permissions);
  const visibleLinks = LINKS.filter((l) => {
    if (l.superadminOnly) return isSuperadmin;
    if (l.requiresAnyRole) return isSuperadmin || l.requiresAnyRole.some((r) => roles.includes(r));
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
    <>
      {/* Up to 12 links -- always-expanded row only fits from md: up
          (more headroom than the guest nav's sm:, since there are more
          links here); below that it collapses into a hamburger-triggered
          drawer, same pattern as (guest)/nav.tsx. */}
      <div className="hidden items-center gap-6 text-sm md:flex">
        {/* prefetch={false}: up to 12 links, all in the initial viewport at
            once -- Next's default viewport-triggered prefetch would eagerly
            render every one of them (full requireStaffContext + that page's
            own DB queries) on every single staff page load, not just the
            one link actually clicked. A real, needless multiplier on DB
            load across the whole dashboard. A click still navigates
            normally, just without the eager background render. */}
        {visibleLinks.map(({ href, labelKey }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className={[
              'relative py-1 transition-colors duration-200',
              href === activeHref
                ? 'text-amber after:absolute after:-bottom-1 after:left-0 after:h-0.5 after:w-full after:rounded-pill after:bg-amber'
                : 'hover:text-amber',
            ].join(' ')}
          >
            {t(labelKey)}
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? 'Close menu' : 'Open menu'}
        className="inline-flex items-center justify-center rounded-full border border-bone/20 p-2 text-bone transition-colors duration-200 hover:border-amber/40 hover:text-amber focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60 focus-visible:ring-offset-2 focus-visible:ring-offset-navy md:hidden"
      >
        <MenuGlyph open={open} />
      </button>

      {open && (
        <nav className="absolute inset-x-0 top-full z-20 flex flex-col gap-1 border-b border-rule bg-navy px-4 py-4 text-sm shadow-lift md:hidden">
          {visibleLinks.map(({ href, labelKey }) => (
            <Link
              key={href}
              href={href}
              prefetch={false}
              onClick={() => setOpen(false)}
              className={`py-2 ${href === activeHref ? 'text-amber' : 'hover:text-amber'}`}
            >
              {t(labelKey)}
            </Link>
          ))}
        </nav>
      )}
    </>
  );
}
