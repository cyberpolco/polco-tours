import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { ratingsService } from '@modules/ratings';
import { PageHeader } from '@/components/ui/PageHeader';
import { RatingStars } from '@/components/ui/RatingStars';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

function formatAverage(
  averageRating: number | null,
  ratingCount: number,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (averageRating == null || ratingCount === 0) return t('noRatingsYet');
  return `${averageRating.toFixed(1)} ★ (${ratingCount})`;
}

// Customer Ratings & Feedback (DR-037) -- staff moderation/insights view.
// Org-wide + per-driver/per-guide averages, plus every individual review
// with its comments. Read-only: Rating Codes are issued from the booking-
// detail page, not here.
export default async function RatingsPage() {
  const ctx = await requireStaffContext('rating.read');
  const [summary, reviews] = await Promise.all([ratingsService.getAggregateSummary(ctx), ratingsService.listReviews(ctx)]);
  const t = await getTranslations('StaffRatings');

  const driverNames = new Map(
    await Promise.all(
      summary.drivers.map(async (d) => [d.id, (await authService.getUser(d.userId))?.name ?? t('driverFallback')] as const),
    ),
  );
  const guideNames = new Map(
    await Promise.all(
      summary.guides.map(async (g) => [g.userId, (await authService.getUser(g.userId))?.name ?? t('guideFallback')] as const),
    ),
  );
  const subjectLabel = (subjectType: 'DRIVER' | 'GUIDE') => (subjectType === 'DRIVER' ? t('subjectDriver') : t('subjectGuide'));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t('eyebrow')} title={t('title')} />

      <div>
        <p className="eyebrow text-mist">{t('agencyOverall')}</p>
        <div className="mt-1 flex items-center gap-2">
          {/* rating=0 renders the muted underlying row with the gold overlay
              clipped to 0% width -- i.e. 5 plain grey stars, the honest
              "nothing rated yet" state rather than fabricating a positive
              look (same no-fake-social-proof convention as the guest
              homepage's TrustSummary, just not hidden entirely here since
              this is a staff-only insights view, not public marketing). */}
          <RatingStars rating={summary.organization.averageRating ?? 0} size="md" />
          <p className="text-lg font-semibold text-navy">
            {formatAverage(summary.organization.averageRating, summary.organization.ratingCount, t)}
          </p>
        </div>
        <a href="#individual-reviews" className="mt-1 inline-block text-sm text-forest hover:underline">
          {t('seeReviews')}
        </a>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('drivers')}</p>
        {summary.drivers.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noDriverProfiles')}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {summary.drivers.map((d) => (
              <li key={d.id}>
                {driverNames.get(d.id)} -- {formatAverage(d.averageRating, d.ratingCount, t)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('tourGuides')}</p>
        {summary.guides.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noGuideProfiles')}</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {summary.guides.map((g) => (
              <li key={g.userId}>
                {guideNames.get(g.userId)} -- {formatAverage(g.averageRating, g.ratingCount, t)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div id="individual-reviews">
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('individualReviews')}</p>
        {reviews.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noReviewsSubmitted')}</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>{t('overall')}</Th>
                <Th>{t('comment')}</Th>
                <Th>{t('driverGuideRatings')}</Th>
                <Th>{t('submitted')}</Th>
              </TableHeaderRow>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <Tr key={r.id}>
                  <Td>{r.overallRating} ★</Td>
                  <Td>{r.overallComment ?? '—'}</Td>
                  <Td>
                    {r.subjectRatings.length === 0
                      ? '—'
                      : r.subjectRatings
                          .map((s) => `${subjectLabel(s.subjectType)} ${s.rating}★${s.comment ? ` (${s.comment})` : ''}`)
                          .join(', ')}
                  </Td>
                  <Td>{r.createdAt.toLocaleDateString()}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
