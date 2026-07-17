'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@prisma/client';
import type { Permission } from '@lib/rbac';

export interface SidebarItem {
  href: string;
  label: string;
  // Omit for an item every staff role should see regardless of permission
  // (e.g. Change Password, DR-043) -- same "no permission arg = any staff
  // role" convention as staff-guard.ts's requireStaffContext.
  permission?: Permission;
  superadminOnly?: boolean;
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
  const isSuperadmin = roles.includes('SUPERADMIN');
  const permissionSet = new Set(permissions);
  const visibleItems = items.filter((item) => {
    if (item.superadminOnly) return isSuperadmin;
    if (!item.permission) return true;
    return isSuperadmin || permissionSet.has(item.permission);
  });
  const activeHref = visibleItems
    .map((i) => i.href)
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <div className="flex gap-10">
      <nav className="w-48 shrink-0 space-y-1 text-sm">
        <p className="eyebrow mb-3 text-mist">{sectionTitle}</p>
        {visibleItems.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`block rounded-survey px-2 py-1 ${href === activeHref ? 'bg-bone font-medium text-navy' : 'text-mist hover:text-navy'}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
