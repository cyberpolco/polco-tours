import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { BackButton } from './back-button';
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
        {/* The public homepage, same target as /staff/login's own
            back-arrow-to-/ link -- a plain client-side navigation, so it
            never touches the session cookie/sign-out flow; the staff
            session stays live if they come back to /staff/* afterward. */}
        <Link href="/" className="eyebrow hover:text-amber">
          Polco Tours · Staff
        </Link>
        <div className="flex items-center gap-6 text-sm">
          <StaffNav roles={ctx.roles} permissions={[...ctx.permissions]} />
          <SignOutButton />
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-8 py-10">
        <BackButton />
        {children}
      </main>
    </div>
  );
}
