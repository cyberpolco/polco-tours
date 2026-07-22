import { getTranslations } from 'next-intl/server';
import { ratingsService } from '@modules/ratings';
import { RatingStars } from '@/components/ui/RatingStars';

// DR-068: the guest homepage's "trusted by travelers" bar -- real data only
// (ratingsService.getPublicAggregateSummary, the same org-wide average/count
// staff already see at /staff/ratings, now surfaced publicly for the first
// time). Renders nothing at all when there are zero reviews yet -- a blank
// "0.0 stars, 0 reviews" line would undermine trust rather than build it,
// and this app doesn't fabricate social proof (see CLAUDE.md's ethical-
// persuasion-only convention). Own next-intl namespace (not HomePage's) so
// this stays reusable on a future page without being coupled to the
// homepage's translation scope.
export async function TrustSummary() {
  const summary = await ratingsService.getPublicAggregateSummary();
  if (summary.ratingCount === 0) return null;

  const t = await getTranslations('TrustSummary');

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-y border-rule py-5">
      <div className="flex items-baseline gap-2">
        <span className="font-serif text-3xl font-semibold text-navy">{summary.averageRating.toFixed(1)}</span>
        <RatingStars rating={summary.averageRating} />
      </div>
      <p className="text-sm text-mist">{t('reviews', { count: summary.ratingCount })}</p>
    </div>
  );
}
