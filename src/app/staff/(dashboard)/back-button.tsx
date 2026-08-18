'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { BackAction } from '@/components/ui/BackLink';

// Rendered once, in layout.tsx, so every staff dashboard page gets a
// consistent "go to the previous page" affordance without each page having
// to add its own -- browser-history back (not a hardcoded parent route),
// since the "previous page" depends on how staff actually navigated here,
// not a fixed hierarchy.
//
// Top-level hub pages reached directly from StaffNav have no meaningful
// "back" destination one level up, so the button is suppressed on exactly
// these routes rather than sending staff to whatever unrelated page browser
// history happens to hold.
const NO_BACK_ROUTES = new Set([
  '/staff/bookings',
  '/staff/bookings/new',
  '/staff/packages',
  '/staff/fleet',
  '/staff/itineraries',
  '/staff/hotels',
  '/staff/restaurants',
  '/staff/schedule',
  '/staff/visa-queue',
  '/staff/tracking',
  '/staff/map',
  '/staff/ratings',
  '/staff/settings/finance',
]);

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('Common');

  if (NO_BACK_ROUTES.has(pathname)) {
    return null;
  }

  return (
    <BackAction onClick={() => router.back()} className="mb-4">
      {t('back')}
    </BackAction>
  );
}
