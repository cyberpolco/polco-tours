import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { StaffNav } from './nav';
import { SignOutButton } from './sign-out-button';

// Route group -- applies ONLY to routes nested here, not to sibling
// src/app/staff/{login,forbidden}/page.tsx (see staff-guard.ts's
// redirect-loop warning: don't move this gate up to src/app/staff/layout.tsx).
export default async function StaffDashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaffContext(); // baseline "are you staff" gate -- any staff-side role

  return (
    <div className="min-h-screen bg-bone text-ink">
      <nav className="flex items-center justify-between border-b border-rule bg-navy px-8 py-4 text-bone">
        <span className="eyebrow">Polco Tours · Staff</span>
        <div className="flex items-center gap-6 text-sm">
          <StaffNav roles={ctx.roles} permissions={[...ctx.permissions]} />
          {/* Voluntary entry point into the self-service flow every role
              already gets forced into once (DR-026) -- previously reachable
              only via that forced redirect, never by choice (e.g. to change
              a password you picked yourself, including SUPERADMIN, who
              can't use the admin reset-password panel on their own account). */}
          <Link href="/staff/change-password" className="text-mist hover:text-bone">
            Change password
          </Link>
          <SignOutButton />
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-8 py-10">{children}</main>
    </div>
  );
}
