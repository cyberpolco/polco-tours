import Link from 'next/link';
import type { BookingOrigin } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { immigrationService, type CountryRegulationView } from '@modules/immigration';
import { visaService } from '@modules/visa';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal, RevealGroup } from '@/components/ui/Reveal';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { formatOrPending } from '@lib/money';
import { VISA_FEE_PAYMENT_STATUS_TONE, VISA_STATUS_TONE } from '@lib/status-tones';
import {
  contactTravelerAction,
  decideApplicationAction,
  deleteApplicationAction,
  markFeePaidAction,
  requestFeePaymentAction,
  requestMissingDocumentsAction,
  startApplicationAction,
  uploadVisaDocumentAction,
} from './actions';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

interface Props {
  searchParams: Promise<{ origin?: string }>;
}

// VISA_FACILITATOR's "My Schedule" (DR-031) -- whole-org queue, no country
// scoping concept exists for this role. Now also reachable by TOUR_OPERATOR
// (DR-034: "the Tour Operator is by default also a Visa Facilitator role").
// DR-060 added starting an application from the "Needs application" section
// below; DR-154 closes the remaining "decide/resubmit/upload stay API-only"
// gap -- a facilitator can now approve/reject an application and upload its
// granted document directly from this table (resubmit is guest-initiated,
// see the booking status page, not a staff action). (IMMIGRATION_OFFICER and
// its own separate country-scoped /staff/immigration page were removed
// entirely in DR-032.)
export default async function VisaQueuePage({ searchParams }: Props) {
  const ctx = await requireStaffContext('visa.process');
  const canDelete = ctx.roles.includes('SUPERADMIN');
  const { origin } = await searchParams;
  const t = await getTranslations('StaffVisaQueue');
  const tVisaStatus = await getTranslations('VisaStatusLabel');
  const tFeeStatus = await getTranslations('VisaFeePaymentStatusLabel');
  const tCountries = await getTranslations('Countries');
  const ORIGIN_LABEL: Record<string, string> = {
    PREDEFINED_PACKAGE: t('packageLabel'),
    TAILOR_MADE: t('planMyTripLabel'),
  };
  const [allApplications, needingApplication] = await Promise.all([
    visaService.listForFacilitator(ctx),
    visaService.listNeedingApplication(ctx),
  ]);
  const now = new Date();

  const applications = origin ? allApplications.filter((a) => a.origin === origin) : allApplications;
  const pendingCount = applications.filter((a) => a.status === 'SUBMITTED').length;
  const missingDocCount = applications.filter((a) => !a.hasDocument).length;

  // Country Regulations, linked in to help assess an application -- per
  // explicit user direction. Sequential awaits over the small distinct-
  // country set (typically <=4, one per platform country), not Promise.all,
  // matching this codebase's documented connection-pool-exhaustion
  // precedent (DR-038/041/060/062/064). Tolerates a country with no
  // regulation row yet (immigrationService.getRegulation 404s) rather than
  // failing the whole queue over it.
  const regulationsByCountry = new Map<string, CountryRegulationView>();
  for (const country of new Set(applications.map((a) => a.country))) {
    try {
      regulationsByCountry.set(country, await immigrationService.getRegulation(ctx, country));
    } catch {
      // No regulation on file for this country yet -- the page falls back
      // to a bare link into /staff/country-regulations/{country} so staff
      // can add one.
    }
  }

  function pillHref(nextOrigin?: string): string {
    return nextOrigin ? `/staff/visa-queue?origin=${nextOrigin}` : '/staff/visa-queue';
  }

  return (
    <div className="space-y-8">
      <div className="space-y-6">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <RevealGroup as="div" itemAs="div" className="flex flex-wrap gap-4" itemClassName="min-w-[220px] flex-1">
          <Card>
            <p className="text-2xl font-bold text-navy">{pendingCount}</p>
            <p className="text-sm text-mist">{t('tasksAwaitingDecision', { count: pendingCount })}</p>
          </Card>
          <Card>
            <p className="text-2xl font-bold text-navy">{missingDocCount}</p>
            <p className="text-sm text-mist">{t('missingDocuments', { count: missingDocCount })}</p>
          </Card>
          <Card>
            <p className="text-2xl font-bold text-navy">{needingApplication.length}</p>
            <p className="text-sm text-mist">{t('travelersNeedingApplication', { count: needingApplication.length })}</p>
          </Card>
        </RevealGroup>

        {needingApplication.length > 0 && (
          <Reveal>
            <h2 className="mb-2 text-sm font-semibold text-navy">{t('needsApplication')}</h2>
            <p className="mb-3 text-xs text-mist">{t('needsApplicationNotice')}</p>
            <Table>
              <thead>
                <TableHeaderRow>
                  <Th>{t('traveler')}</Th>
                  <Th>{t('nationality')}</Th>
                  <Th>{t('source')}</Th>
                  <Th>{t('passport')}</Th>
                  <Th>{t('actions')}</Th>
                </TableHeaderRow>
              </thead>
              <tbody>
                {needingApplication.map((n) => (
                  <Tr key={n.travelerId}>
                    <Td>
                      {n.travelerFirstName} {n.travelerLastName}
                    </Td>
                    <Td>{n.travelerNationality}</Td>
                    <Td className="text-xs text-mist">{ORIGIN_LABEL[n.origin] ?? n.origin}</Td>
                    <Td>
                      {/* Every row here has an uploaded passport by definition
                          (that's exactly what "needs application" means) --
                          worth surfacing so staff can check it before starting. */}
                      <a
                        href={`/api/v1/bookings/${n.bookingId}/travelers/${n.travelerId}/passport`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-forest hover:underline"
                      >
                        {t('view')}
                      </a>
                    </Td>
                    <Td>
                      <form action={startApplicationAction.bind(null, n.bookingId, n.travelerId)}>
                        <SubmitButton size="compact" pendingLabel={t('starting')}>
                          {t('startApplication')}
                        </SubmitButton>
                      </form>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </Reveal>
        )}
      </div>

      <Reveal>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={pillHref(undefined)}
            className={`rounded-pill border border-rule px-3 py-1 transition-colors ${!origin ? 'bg-navy text-bone' : 'text-ink hover:bg-mist/10'}`}
          >
            {t('all')} ({allApplications.length})
          </Link>
          {(['PREDEFINED_PACKAGE', 'TAILOR_MADE'] satisfies BookingOrigin[]).map((o) => {
            const count = allApplications.filter((a) => a.origin === o).length;
            if (count === 0) return null;
            return (
              <Link
                key={o}
                href={pillHref(o)}
                className={`rounded-pill border border-rule px-3 py-1 transition-colors ${origin === o ? 'bg-navy text-bone' : 'text-ink hover:bg-mist/10'}`}
              >
                {ORIGIN_LABEL[o]} ({count})
              </Link>
            );
          })}
        </div>

        {applications.length === 0 ? (
          <p className="text-mist">{t('noMatches')}</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>{t('traveler')}</Th>
                <Th>{t('reference')}</Th>
                <Th>{t('nationality')}</Th>
                <Th>{t('source')}</Th>
                <Th>{t('country')}</Th>
                <Th>{t('status')}</Th>
                <Th>{t('governmentFee')}</Th>
                <Th>{t('travelDate')}</Th>
                <Th>{t('document')}</Th>
                <Th>{t('passport')}</Th>
                <Th>{t('rejectionReason')}</Th>
                <Th>{t('actions')}</Th>
                {canDelete && <Th />}
              </TableHeaderRow>
            </thead>
            <tbody>
              {applications.map((a) => {
                const regulation = regulationsByCountry.get(a.country);
                return (
                <Tr key={a.id}>
                  <Td>
                    {a.travelerFirstName} {a.travelerLastName}
                  </Td>
                  <Td>
                    {/* The package reference when this came from an existing
                        package, otherwise the booking reference (explicit
                        user direction) -- links into the booking detail page
                        either way, since that's what the reference identifies. */}
                    {a.bookingId ? (
                      <Link href={`/staff/bookings/${a.bookingId}`} className="text-forest hover:underline">
                        {a.packageReference ?? a.bookingReference ?? '—'}
                      </Link>
                    ) : (
                      (a.packageReference ?? a.bookingReference ?? '—')
                    )}
                  </Td>
                  <Td>{a.travelerNationality}</Td>
                  <Td className="text-xs text-mist">{a.origin ? (ORIGIN_LABEL[a.origin] ?? a.origin) : '—'}</Td>
                  <Td>
                    {tCountries(a.country)}
                    <div className="mt-1 text-xs">
                      {regulation?.processingTimeDays != null && (
                        <span className="text-mist">{t('daysProcessing', { days: regulation.processingTimeDays })}</span>
                      )}
                      <Link href={`/staff/country-regulations/${a.country}`} className="text-forest hover:underline">
                        {regulation ? t('viewRequirements') : t('addRequirements')}
                      </Link>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={VISA_STATUS_TONE[a.status]}>{tVisaStatus(a.status)}</Badge>
                  </Td>
                  <Td>
                    <div className="space-y-1">
                      <p>{formatOrPending(a.governmentFeeMinor, a.governmentFeeCurrency, t('feeUnspecified'))}</p>
                      <Badge tone={VISA_FEE_PAYMENT_STATUS_TONE[a.feePaymentStatus]}>{tFeeStatus(a.feePaymentStatus)}</Badge>
                      {a.bookingId && a.feePaymentStatus === 'NOT_REQUESTED' && (
                        <form action={requestFeePaymentAction.bind(null, a.bookingId, a.travelerId)}>
                          <SubmitButton size="compact" variant="secondary" pendingLabel={t('requestingFee')}>
                            {t('requestFee')}
                          </SubmitButton>
                        </form>
                      )}
                      {a.bookingId && a.feePaymentStatus === 'REQUESTED' && (
                        <form action={markFeePaidAction.bind(null, a.bookingId, a.travelerId)}>
                          <SubmitButton size="compact" variant="secondary" pendingLabel={t('markingFeePaid')}>
                            {t('markFeePaid')}
                          </SubmitButton>
                        </form>
                      )}
                    </div>
                  </Td>
                  <Td>
                    {a.travelStartDate ? (
                      <>
                        {a.travelStartDate.toLocaleDateString()}{' '}
                        <span className="text-xs text-mist">{t('daysSuffix', { days: daysUntil(a.travelStartDate, now) })}</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {a.hasDocument ? t('yes') : <Badge tone="warning">{t('missing')}</Badge>}
                  </Td>
                  <Td>
                    {a.bookingId && a.hasPassport ? (
                      <a
                        href={`/api/v1/bookings/${a.bookingId}/travelers/${a.travelerId}/passport`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-forest hover:underline"
                      >
                        {t('view')}
                      </a>
                    ) : (
                      <span className="text-xs text-mist">{t('notUploaded')}</span>
                    )}
                  </Td>
                  <Td>{a.rejectionReason ?? '—'}</Td>
                  <Td>
                    {a.bookingId && (
                      <div className="space-y-2">
                        <form action={contactTravelerAction.bind(null, a.bookingId, a.travelerId)} className="flex gap-2">
                          <input
                            name="message"
                            required
                            placeholder={t('messagePlaceholder')}
                            className="w-40 rounded-survey border border-rule px-2 py-1 text-xs"
                          />
                          <SubmitButton size="compact" pendingLabel={t('sending')}>
                            {t('contact')}
                          </SubmitButton>
                        </form>
                        {!a.hasDocument && (
                          <form action={requestMissingDocumentsAction.bind(null, a.bookingId, a.travelerId)}>
                            <SubmitButton size="compact" variant="secondary" pendingLabel={t('sending')}>
                              {t('requestDocuments')}
                            </SubmitButton>
                          </form>
                        )}
                        {a.status === 'SUBMITTED' && (
                          <form action={decideApplicationAction.bind(null, a.bookingId, a.travelerId)} className="flex flex-wrap items-center gap-2">
                            <select name="outcome" required className="rounded-survey border border-rule px-2 py-1 text-xs">
                              <option value="APPROVED">{t('approve')}</option>
                              <option value="REJECTED">{t('reject')}</option>
                            </select>
                            <input
                              name="reason"
                              placeholder={t('rejectionReasonPlaceholder')}
                              className="w-40 rounded-survey border border-rule px-2 py-1 text-xs"
                            />
                            <SubmitButton size="compact" pendingLabel={t('deciding')}>
                              {t('decide')}
                            </SubmitButton>
                          </form>
                        )}
                        <form action={uploadVisaDocumentAction.bind(null, a.bookingId, a.travelerId)} className="flex items-center gap-2">
                          <input type="file" name="document" required className="w-40 text-xs" />
                          <SubmitButton size="compact" variant="secondary" pendingLabel={t('uploading')}>
                            {t('uploadDocument')}
                          </SubmitButton>
                        </form>
                      </div>
                    )}
                  </Td>
                  {canDelete && (
                    <Td>
                      <form action={deleteApplicationAction.bind(null, a.id)}>
                        <SubmitButton variant="secondary" size="compact" pendingLabel={t('deleting')} confirmMessage={t('deleteConfirm')}>
                          {t('delete')}
                        </SubmitButton>
                      </form>
                    </Td>
                  )}
                </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Reveal>
    </div>
  );
}
