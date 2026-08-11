import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/Badge';

// DR-068: extends the existing plain Available/Unavailable badge with a
// real seat count, shown ONLY when it's genuinely low -- never used to
// fabricate urgency on a departure that isn't actually scarce (ethical-
// persuasion-only convention, see CLAUDE.md). `seatsAvailable` must come
// from real data (booking/domain.ts's computeAvailability), never a made-up
// number.
//
// Note for future wiring: since DR-054, a guest booking a PREDEFINED_PACKAGE
// via /packages/[packageId] gets a FRESH Departure created just for their
// own party (capacity == their own seat count) -- there's no shared seat
// pool to be "low" on at that specific page. Real shared-capacity scarcity
// currently only exists for a staff-managed Departure (e.g. /book/
// [departureId], used by /staff/bookings/new's reused guest forms). Don't
// wire a `seatsAvailable` prop here from a context that doesn't actually
// have shared capacity -- omit the prop (or pass null) and it degrades to
// the honest plain Available/Unavailable badge.
const DEFAULT_LOW_STOCK_THRESHOLD = 5;

interface AvailabilityBadgeProps {
  bookable: boolean;
  seatsAvailable?: number | null;
  lowStockThreshold?: number;
}

export async function AvailabilityBadge({
  bookable,
  seatsAvailable = null,
  lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD,
}: AvailabilityBadgeProps) {
  const t = await getTranslations('Common');
  if (!bookable) return <Badge tone="neutral">{t('unavailable')}</Badge>;

  if (seatsAvailable != null && seatsAvailable > 0 && seatsAvailable <= lowStockThreshold) {
    return (
      <Badge tone="scarcity">{t('seatsLeft', { count: seatsAvailable })}</Badge>
    );
  }

  return <Badge tone="success">{t('available')}</Badge>;
}
