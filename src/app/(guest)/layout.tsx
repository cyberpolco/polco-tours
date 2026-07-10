import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';
import { GuestFooter } from './footer';
import { GuestNav } from './nav';

// Public chrome for the tourist self-serve site (DR-016) -- a route group so
// this nav doesn't leak into /staff (which has its own dashboard layout) or
// affect the bare root layout.tsx. No auth gate here; /booking/[bookingId]
// pages gate themselves via requireGuestContext.
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-bone text-ink">
      <header className="border-b border-rule bg-navy text-bone">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-8 py-4">
          <Link href="/" className="eyebrow flex items-center gap-2 text-amber">
            <BrandMark className="h-5 w-5" />
            Polco Tours
          </Link>
          <GuestNav />
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-10">{children}</main>
      <GuestFooter />
    </div>
  );
}
