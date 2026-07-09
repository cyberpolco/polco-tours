import type { ReactNode } from 'react';
import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { SignOutButton } from './sign-out-button';

// Route group -- applies ONLY to routes nested here, not to sibling
// src/app/staff/{login,forbidden}/page.tsx (see staff-guard.ts's
// redirect-loop warning: don't move this gate up to src/app/staff/layout.tsx).
export default async function StaffDashboardLayout({ children }: { children: ReactNode }) {
  await requireStaffContext('booking.confirm'); // baseline "are you staff" gate

  return (
    <div className="min-h-screen bg-bone text-ink">
      <nav className="flex items-center justify-between border-b border-rule bg-navy px-8 py-4 text-bone">
        <span className="text-xs font-semibold tracking-survey">POLCO TOURS · STAFF</span>
        <div className="flex items-center gap-6 text-sm">
          <Link href="/staff/bookings">Bookings</Link>
          <Link href="/staff/bookings/new">New booking</Link>
          <SignOutButton />
        </div>
      </nav>
      <main className="mx-auto max-w-5xl px-8 py-10">{children}</main>
    </div>
  );
}
