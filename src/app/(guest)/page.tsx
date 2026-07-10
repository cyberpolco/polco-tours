import Link from 'next/link';
import { catalogService } from '@modules/catalog';
import { TopographicPattern } from '@/components/TopographicPattern';
import { Card } from '@/components/ui/Card';
import { LinkButton } from '@/components/ui/Button';
import { PackageCard } from './package-card';

// Fetches from the DB (listPublicPackages), and unlike packages/page.tsx
// there's no searchParams access to implicitly force dynamic rendering --
// without this, Next tries to prerender "/" at build time and fails wherever
// DATABASE_URL isn't available at build (this sandbox, and possibly CI).
export const dynamic = 'force-dynamic';

const STEPS = [
  {
    mark: '01',
    title: 'Browse or take the quiz',
    body: 'Look through every package across Namibia and the DRC, or answer a few questions and let us narrow it down for you.',
  },
  {
    mark: '02',
    title: 'Book as a guest',
    body: 'No account, no password. Pick a departure, add travelers, and pay a deposit -- all in one sitting.',
  },
  {
    mark: '03',
    title: 'Keep your reference code',
    body: 'Every booking gets a short code so you can look it up and check its status any time, from any device.',
  },
] as const;

// Replaces the Phase-0 placeholder that used to live at src/app/page.tsx --
// this route group (DR-016) is the real product surface it deferred to.
export default async function HomePage() {
  // "/" is the highest-traffic route on the site and, unlike every other
  // catalog-backed page, has no reason to fail the whole page over this one
  // decorative section -- a DB hiccup here should degrade to "no featured
  // packages", not a 500 for every visitor landing on the homepage.
  let featured: Awaited<ReturnType<typeof catalogService.listPublicPackages>> = [];
  try {
    featured = (await catalogService.listPublicPackages()).slice(0, 3);
  } catch (error) {
    console.error('Failed to load featured packages for homepage', error);
  }

  return (
    <div className="space-y-16 pb-8">
      <div className="relative overflow-hidden pt-8">
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
          <LinkButton href="/packages">Browse packages</LinkButton>
          <LinkButton href="/quiz" variant="secondary">
            Tailor my trip
          </LinkButton>
        </div>
      </div>

      {featured.length > 0 && (
        <div>
          <div className="survey-rule mb-8" />
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow text-mist">Featured</p>
              <h2 className="mt-1 text-2xl font-bold text-navy">A few places to start</h2>
            </div>
            <Link href="/packages" className="text-sm text-forest hover:underline">
              View all packages →
            </Link>
          </div>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {featured.map((p) => (
              <PackageCard key={p.id} pkg={p} />
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="survey-rule mb-8" />
        <p className="eyebrow text-mist">How it works</p>
        <h2 className="mt-1 text-2xl font-bold text-navy">From browsing to booked</h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step) => (
            <Card as="li" key={step.mark}>
              <p className="font-serif text-3xl text-amber">{step.mark}</p>
              <h3 className="mt-2 font-semibold text-navy">{step.title}</h3>
              <p className="mt-2 text-sm text-mist">{step.body}</p>
            </Card>
          ))}
        </ul>
      </div>

      <div className="rounded-survey bg-navy px-8 py-10 text-bone">
        <p className="eyebrow text-amber">Ready when you are</p>
        <h2 className="mt-2 text-2xl font-bold">Start planning your trip today.</h2>
        <div className="mt-6 flex flex-wrap gap-4">
          <LinkButton href="/packages">Browse packages</LinkButton>
          <Link
            href="/quiz"
            className="inline-flex items-center justify-center rounded-survey border border-bone px-5 py-3 text-sm font-semibold text-bone"
          >
            Tailor my trip
          </Link>
        </div>
      </div>
    </div>
  );
}
