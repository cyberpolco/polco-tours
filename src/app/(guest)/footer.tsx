import Link from 'next/link';
import { BrandMark } from '@/components/BrandMark';

// Kept honest -- no fabricated contact info (no cleared trademark/business
// registration yet, OI-02/03 in CLAUDE.md), just the brand, real nav links,
// and a legal line. Wired into GuestLayout below <main>.
export function GuestFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-rule bg-navy text-bone">
      <div className="mx-auto max-w-5xl px-8 py-10">
        <div className="flex flex-wrap items-start justify-between gap-8">
          <div>
            <div className="flex items-center gap-2 text-amber">
              <BrandMark className="h-5 w-5" />
              <span className="eyebrow">Polco Tours</span>
            </div>
            <p className="mt-3 max-w-xs text-sm text-mist">
              Tourism Operating System for Namibia &amp; the Democratic Republic of Congo.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-sm">
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
          <p className="eyebrow text-mist">Namibia · DRC</p>
        </div>
        <div className="survey-rule mt-8 opacity-20" />
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-mist">&copy; {year} Polco Tours.</p>
          <Link href="/staff/login" className="text-xs text-mist hover:text-amber">
            Admin Access
          </Link>
        </div>
      </div>
    </footer>
  );
}
