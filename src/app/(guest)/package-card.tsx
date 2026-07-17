import Link from 'next/link';
import type { TourPackageView } from '@modules/catalog';
import { Card } from '@/components/ui/Card';
import { formatOrPending } from '@lib/money';

// Was duplicated verbatim in packages/page.tsx and quiz/results/page.tsx --
// one definition now.
export function PackageCard({ pkg }: { pkg: TourPackageView }) {
  return (
    <Card as="li">
      <Link href={`/packages/${pkg.id}`} className="block">
        <h2 className="font-semibold text-navy hover:underline">{pkg.title}</h2>
        <p className="mt-1 text-sm text-mist">{pkg.description}</p>
        <p className="mt-2 text-sm">
          {pkg.country} · {pkg.durationDays ? `${pkg.durationDays} days` : 'duration varies'} ·{' '}
          {formatOrPending(pkg.priceMinor, pkg.currency)}/seat
        </p>
        {pkg.tags.length > 0 && <p className="eyebrow mt-1 text-forest">{pkg.tags.join(' · ')}</p>}
      </Link>
    </Card>
  );
}
