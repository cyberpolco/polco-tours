import type { ReactNode } from 'react';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { BackButton } from './back-button';
import { StaffNav } from './nav';
import { SignOutButton } from './sign-out-button';

// Route group -- applies ONLY to routes nested here, not to sibling
// src/app/staff/{login,forbidden}/page.tsx (see staff-guard.ts's
// redirect-loop warning: don't move this gate up to src/app/staff/layout.tsx).
export default async function StaffDashboardLayout({ children }: { children: ReactNode }) {
  const ctx = await requireStaffContext(); // baseline "are you staff" gate -- any staff-side role
  const t = await getTranslations('StaffChrome');

  return (
    <div className="min-h-screen bg-bone text-ink">
      {/* relative: anchors StaffNav's absolutely-positioned mobile drawer
          (top-full) to this header instead of the page body. flex-wrap
          (matching (guest)/layout.tsx's header): brand text + hamburger +
          LanguageSwitcher + SignOutButton don't all fit on one row on a
          narrow phone -- without wrap, the tail end (SignOutButton) got
          pushed off-screen with no scroll affordance instead of dropping
          to its own row. */}
      <nav className="relative flex flex-wrap items-center justify-between gap-y-2 border-b border-rule bg-navy px-4 py-4 text-bone sm:px-8">
        {/* The public homepage, same target as /staff/login's own
            back-arrow-to-/ link -- a plain client-side navigation, so it
            never touches the session cookie/sign-out flow; the staff
            session stays live if they come back to /staff/* afterward. */}
        <Link href="/" className="eyebrow hover:text-amber">
          {t('brand')}
        </Link>
        <div className="flex items-center gap-4 text-sm sm:gap-6">
          <StaffNav roles={ctx.roles} permissions={[...ctx.permissions]} />
          <LanguageSwitcher />
          <SignOutButton />
        </div>
      </nav>
      {/* Bounded column, wider than max-w-7xl (Tailwind's largest named
          size) but well short of the full viewport -- three rounds of
          user feedback: max-w-5xl was too narrow, fully unbounded/
          edge-to-edge was too wide, and max-w-7xl still too small. A
          custom arbitrary value since Tailwind has nothing named wider
          than 7xl out of the box. */}
      <main className="mx-auto max-w-[100rem] px-4 py-6 sm:px-8 sm:py-10">
        <BackButton />
        {children}
      </main>
    </div>
  );
}
