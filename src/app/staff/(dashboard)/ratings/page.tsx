import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { ratingsService } from '@modules/ratings';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';

function formatAverage(averageRating: number | null, ratingCount: number): string {
  if (averageRating == null || ratingCount === 0) return 'No ratings yet';
  return `${averageRating.toFixed(1)} ★ (${ratingCount})`;
}

// Customer Ratings & Feedback (DR-037) -- staff moderation/insights view.
// Org-wide + per-driver/per-guide averages, plus every individual review
// with its comments. Read-only: Rating Codes are issued from the booking-
// detail page, not here.
export default async function RatingsPage() {
  const ctx = await requireStaffContext('rating.read');
  const [summary, reviews] = await Promise.all([ratingsService.getAggregateSummary(ctx), ratingsService.listReviews(ctx)]);

  const driverNames = new Map(
    await Promise.all(
      summary.drivers.map(async (d) => [d.id, (await authService.getUser(d.userId))?.name ?? 'Driver'] as const),
    ),
  );
  const guideNames = new Map(
    await Promise.all(
      summary.guides.map(async (g) => [g.userId, (await authService.getUser(g.userId))?.name ?? 'Guide'] as const),
    ),
  );

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Insights" title="Ratings & feedback" />

      <div>
        <p className="eyebrow text-mist">Agency overall</p>
        <p className="mt-1 text-lg font-semibold text-navy">
          {formatAverage(summary.organization.averageRating, summary.organization.ratingCount)}
        </p>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Drivers</p>
        {summary.drivers.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No driver profiles yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {summary.drivers.map((d) => (
              <li key={d.id}>
                {driverNames.get(d.id)} -- {formatAverage(d.averageRating, d.ratingCount)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Tour guides</p>
        {summary.guides.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No guide profiles yet.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {summary.guides.map((g) => (
              <li key={g.userId}>
                {guideNames.get(g.userId)} -- {formatAverage(g.averageRating, g.ratingCount)}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">Individual reviews</p>
        {reviews.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No reviews submitted yet.</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>Overall</Th>
                <Th>Comment</Th>
                <Th>Driver/guide ratings</Th>
                <Th>Submitted</Th>
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
                      : r.subjectRatings.map((s) => `${s.subjectType} ${s.rating}★${s.comment ? ` (${s.comment})` : ''}`).join(', ')}
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
