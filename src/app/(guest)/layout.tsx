import Link from 'next/link';

// Public chrome for the tourist self-serve site (DR-016) -- a route group so
// this nav doesn't leak into /staff (which has its own dashboard layout) or
// affect the bare root layout.tsx. No auth gate here; /booking/[bookingId]
// pages gate themselves via requireGuestContext.
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bone text-ink">
      <header className="border-b border-rule bg-navy text-bone">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-4">
          <Link href="/" className="text-xs font-semibold tracking-survey text-amber">
            POLCO TOURS
          </Link>
          <nav className="flex gap-6 text-sm">
            <Link href="/packages" className="hover:text-amber">
              Browse
            </Link>
            <Link href="/quiz" className="hover:text-amber">
              Tailor my trip
            </Link>
            <Link href="/find-booking" className="hover:text-amber">
              Find my booking
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-8 py-10">{children}</main>
    </div>
  );
}
