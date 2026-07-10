import Link from 'next/link';
import { TopographicPattern } from '@/components/TopographicPattern';

// Replaces the Phase-0 placeholder that used to live at src/app/page.tsx --
// this route group (DR-016) is the real product surface it deferred to.
export default function HomePage() {
  return (
    <div className="relative overflow-hidden py-8">
      <TopographicPattern className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-navy/[0.06]" />
      <p className="eyebrow mb-4 text-amber">Namibia &amp; the DRC</p>
      <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-navy sm:text-5xl">
        Tours worth crossing a border for.
      </h1>
      <p className="mt-6 max-w-xl text-mist">
        Browse safaris, treks, and cultural trips across Namibia and the Democratic
        Republic of Congo -- no account needed. Book as a guest and you&apos;ll get a
        reference code to check on your trip any time.
      </p>
      <div className="mt-8 flex gap-4">
        <Link href="/packages" className="rounded-survey bg-amber px-5 py-3 text-sm font-semibold text-navy">
          Browse packages
        </Link>
        <Link href="/quiz" className="rounded-survey border border-navy px-5 py-3 text-sm font-semibold text-navy">
          Tailor my trip
        </Link>
      </div>
    </div>
  );
}
