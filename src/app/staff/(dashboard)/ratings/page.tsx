import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { ratingsService } from '@modules/ratings';
import { PageHeader } from '@/components/ui/PageHeader';
import { RatingStars } from '@/components/ui/RatingStars';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { deleteReviewAction } from './actions';

function DeleteReviewButton({
  reviewId,
  removingLabel,
  removeConfirm,
  removeLabel,
}: {
  reviewId: string;
  removingLabel: string;
  removeConfirm: string;
  removeLabel: string;
}) {
  return (
    <form action={deleteReviewAction.bind(null, reviewId)}>
      <SubmitButton variant="secondary" size="compact" pendingLabel={removingLabel} confirmMessage={removeConfirm}>
        {removeLabel}
      </SubmitButton>
    </form>
  );
}

function formatAverage(
  averageRating: number | null,
  ratingCount: number,
  t: (key: string, values?: Record<string, number>) => string,
): string {
  if (averageRating == null || ratingCount === 0) return t('noRatingsYet');
  return `${averageRating.toFixed(1)} ★ (${ratingCount})`;
}

// Pill-style stat used in place of the old plain "Name -- 4.5 ★ (12)" text
// line, matching the neutral-pill recipe just introduced on the guest
// package pages (rounded-pill bg-mist/10 text-mist).
function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-pill bg-mist/10 px-2.5 py-1 text-xs font-semibold text-mist">{children}</span>;
}

// Customer Ratings & Feedback (DR-037) -- staff moderation/insights view.
// Org-wide + per-driver/per-guide averages, plus every individual review
// with its comments. Read-only: Rating Codes are issued from the booking-
// detail page, not here.
export default async function RatingsPage() {
  const ctx = await requireStaffContext('rating.read');
  const canDelete = ctx.roles.includes('SUPERADMIN');
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

      <Reveal className="space-y-8">
      <div>
        <p className="eyebrow text-mist">{t('agencyOverall')}</p>
        <div className="mt-2 flex items-center gap-3">
          {/* rating=0 renders the muted underlying row with the gold overlay
              clipped to 0% width -- i.e. 5 plain grey stars, the honest
              "nothing rated yet" state rather than fabricating a positive
              look (same no-fake-social-proof convention as the guest
              homepage's TrustSummary, just not hidden entirely here since
              this is a staff-only insights view, not public marketing). */}
          <RatingStars rating={summary.organization.averageRating ?? 0} size="md" />
          {summary.organization.averageRating == null || summary.organization.ratingCount === 0 ? (
            <p className="text-lg font-semibold text-navy">{t('noRatingsYet')}</p>
          ) : (
            <p className="text-2xl font-bold text-navy">
              {summary.organization.averageRating.toFixed(1)}
              <span className="ml-1.5 text-xs font-medium text-mist">★ ({summary.organization.ratingCount})</span>
            </p>
          )}
        </div>
        <a href="#individual-reviews" className="mt-2 inline-block text-sm text-forest hover:underline">
          {t('seeReviews')}
        </a>
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('drivers')}</p>
        {summary.drivers.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noDriverProfiles')}</p>
        ) : (
          <RevealGroup as="ul" itemAs="li" className="mt-2 space-y-2">
            {summary.drivers.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-rule px-3 py-2 text-sm"
              >
                <span className="font-medium text-ink">{driverNames.get(d.id)}</span>
                {d.averageRating == null || d.ratingCount === 0 ? (
                  <Pill>{t('noRatingsYet')}</Pill>
                ) : (
                  <span className="flex items-center gap-2">
                    <RatingStars rating={d.averageRating} size="sm" />
                    <Pill>{formatAverage(d.averageRating, d.ratingCount, t)}</Pill>
                  </span>
                )}
              </div>
            ))}
          </RevealGroup>
        )}
      </div>

      <div>
        <div className="survey-rule mb-4" />
        <p className="eyebrow text-mist">{t('tourGuides')}</p>
        {summary.guides.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noGuideProfiles')}</p>
        ) : (
          <RevealGroup as="ul" itemAs="li" className="mt-2 space-y-2">
            {summary.guides.map((g) => (
              <div
                key={g.userId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-rule px-3 py-2 text-sm"
              >
                <span className="font-medium text-ink">{guideNames.get(g.userId)}</span>
                {g.averageRating == null || g.ratingCount === 0 ? (
                  <Pill>{t('noRatingsYet')}</Pill>
                ) : (
                  <span className="flex items-center gap-2">
                    <RatingStars rating={g.averageRating} size="sm" />
                    <Pill>{formatAverage(g.averageRating, g.ratingCount, t)}</Pill>
                  </span>
                )}
              </div>
            ))}
          </RevealGroup>
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
                {canDelete && <Th />}
              </TableHeaderRow>
            </thead>
            <tbody>
              {reviews.map((r) => (
                <Tr key={r.id}>
                  <Td className="font-semibold text-navy">{r.overallRating} ★</Td>
                  <Td>{r.overallComment ?? '—'}</Td>
                  <Td>
                    {r.subjectRatings.length === 0 ? (
                      '—'
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {r.subjectRatings.map((s, i) => (
                          <Pill key={i}>
                            {subjectLabel(s.subjectType)} {s.rating}★{s.comment ? ` · ${s.comment}` : ''}
                          </Pill>
                        ))}
                      </div>
                    )}
                  </Td>
                  <Td>{r.createdAt.toLocaleDateString()}</Td>
                  {canDelete && (
                    <Td>
                      <DeleteReviewButton
                        reviewId={r.id}
                        removingLabel={t('deleting')}
                        removeConfirm={t('deleteConfirm')}
                        removeLabel={t('delete')}
                      />
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
      </Reveal>
    </div>
  );
}
