import Link from 'next/link';
import type { Metadata } from 'next';
import { Logo } from '@/components/Logo';
import { GuestFooter } from './footer';
import { MaintenanceBanner } from './maintenance-banner';
import { GuestNav } from './nav';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

// Scoped to this route group only -- the root layout.tsx metadata ("POLCO
// TOURS") still covers the staff dashboard, which keeps the POLCO TOURS
// name (DR-168: guest-facing brand text only was renamed to Mufasa Safaris
// & Tours, staff dashboard/emails intentionally excluded).
export const metadata: Metadata = {
  title: {
    default: 'Mufasa Safaris & Tours',
    template: '%s | Mufasa Safaris & Tours',
  },
  description: 'Tourism OS Powered by Cyber PolCo.',
};

// Public chrome for the tourist self-serve site (DR-016) -- a route group so
// this nav doesn't leak into /staff (which has its own dashboard layout) or
// affect the bare root layout.tsx. No auth gate here; /booking/[bookingId]
// pages gate themselves via requireGuestContext.
//
// NextIntlClientProvider now lives at the true root layout.tsx (full EN/FR
// coverage extended to the staff dashboard) -- this layout no longer needs
// its own instance, just the guest-only chrome (nav/footer/switcher).
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bone text-ink">
      <MaintenanceBanner />
      <header className="relative border-b border-rule bg-navy text-bone">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="eyebrow flex items-center gap-2 text-amber">
            <Logo className="h-10 w-10 sm:h-20 sm:w-20" />
            Mufasa Safaris & Tours
          </Link>
          <div className="flex items-center gap-6">
            <GuestNav />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-8">{children}</main>
      <GuestFooter />
    </div>
  );
}
