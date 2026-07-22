import Link from 'next/link';
import { NextIntlClientProvider } from 'next-intl';
import { BrandMark } from '@/components/BrandMark';
import { GuestFooter } from './footer';
import { GuestNav } from './nav';
import { LanguageSwitcher } from './language-switcher';

// Public chrome for the tourist self-serve site (DR-016) -- a route group so
// this nav doesn't leak into /staff (which has its own dashboard layout) or
// affect the bare root layout.tsx. No auth gate here; /booking/[bookingId]
// pages gate themselves via requireGuestContext.
//
// NextIntlClientProvider is scoped to just this guest tree (DR-023), not the
// true root layout -- the staff dashboard has never been in i18n scope, so
// there's no reason for it to carry the provider too. No explicit
// locale/messages props needed; next-intl's plugin (next.config.mjs)
// auto-supplies them from src/i18n/request.ts's getRequestConfig.
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider>
      <div className="flex min-h-screen flex-col bg-bone text-ink">
        <header className="relative border-b border-rule bg-navy text-bone">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8">
            <Link href="/" className="eyebrow flex items-center gap-2 text-amber">
              <BrandMark className="h-5 w-5" />
              Polco Tours
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
    </NextIntlClientProvider>
  );
}
