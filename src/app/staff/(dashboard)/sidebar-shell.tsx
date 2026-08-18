'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { Role } from '@prisma/client';
import type { Permission } from '@lib/rbac';

export interface SidebarItem {
  href: string;
  labelKey: string;
  // Omit for an item every staff role should see regardless of permission
  // (e.g. Change Password, DR-043) -- same "no permission arg = any staff
  // role" convention as staff-guard.ts's requireStaffContext.
  permission?: Permission;
  superadminOnly?: boolean;
  // Same role-based narrowing as nav.tsx's NavLink.requiresAnyRole --
  // for an item whose real gate isn't expressible as a single permission
  // (e.g. Clients: SUPERADMIN + TOUR_OPERATOR only, not everyone who
  // happens to hold booking.read).
  requiresAnyRole?: Role[];
  // For an item merging several pages with different individual gates
  // (e.g. Finance: tax/platform rates + coupons need platform_settings.read,
  // Operational Rates needs finance_config.read) -- visible if the caller
  // holds ANY one of these, not all.
  anyPermission?: Permission[];
}

// Settings (DR-042): a left-vertical sub-nav for a
// subset of staff pages, without moving their URLs. Next.js layouts are
// strictly path-hierarchy-based and these 5+2 pages keep their existing
// routes (e.g. /staff/country-regulations, /staff/admin/users), so a
// nested layout.tsx isn't an option -- this is a plain Client Component
// each page imports and wraps its own content in, same "usePathname() for
// active-link styling, roles/permissions passed as already-resolved props"
// shape as StaffNav (nav.tsx).
export function SidebarShell({
  items,
  sectionTitle,
  roles,
  permissions,
  children,
}: {
  items: SidebarItem[];
  sectionTitle: string;
  roles: Role[];
  permissions: Permission[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const t = useTranslations('StaffSettingsSidebar');
  const isSuperadmin = roles.includes('SUPERADMIN');
  const permissionSet = new Set(permissions);
  const visibleItems = items.filter((item) => {
    if (item.superadminOnly) return isSuperadmin;
    if (item.requiresAnyRole) return isSuperadmin || item.requiresAnyRole.some((r) => roles.includes(r));
    if (item.anyPermission) return isSuperadmin || item.anyPermission.some((p) => permissionSet.has(p));
    if (!item.permission) return true;
    return isSuperadmin || permissionSet.has(item.permission);
  });
  const activeHref = visibleItems
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-10">
      {/* Fixed-width side column only from lg: up -- below that, a squeezed
          w-48 sidebar next to flex-1 content left no room to read either
          on a phone. Becomes a horizontally-scrollable pill row (own
          overflow-x-auto, not the whole page) stacked above the content. */}
      <nav className="flex gap-2 overflow-x-auto pb-1 text-sm lg:w-48 lg:shrink-0 lg:flex-col lg:gap-1 lg:space-y-1 lg:overflow-visible lg:pb-0">
        <p className="eyebrow hidden shrink-0 text-mist lg:mb-3 lg:block">{sectionTitle}</p>
        {/* prefetch={false}: same reasoning as StaffNav (nav.tsx) -- every
            item here is visible at once, so the default viewport-triggered
            prefetch would eagerly render every sub-page on every visit to
            any one of them. */}
        {visibleItems.map(({ href, labelKey }) => (
          <Link
            key={href}
            href={href}
            prefetch={false}
            className={`shrink-0 rounded-survey px-2 py-1 lg:block ${href === activeHref ? 'bg-bone font-medium text-navy' : 'text-mist hover:text-navy'}`}
          >
            {t(labelKey)}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
