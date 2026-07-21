import Link from 'next/link';
import type { BookingOrigin } from '@prisma/client';
import { requireStaffContext } from '@lib/staff-guard';
import { immigrationService, type CountryRegulationView } from '@modules/immigration';
import { visaService } from '@modules/visa';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { VISA_STATUS_TONE } from '@lib/status-tones';
import { contactTravelerAction, requestMissingDocumentsAction, startApplicationAction } from './actions';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const ORIGIN_LABEL: Record<string, string> = {
  PREDEFINED_PACKAGE: 'Package',
  TAILOR_MADE: 'Plan my trip',
};

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

interface Props {
  searchParams: Promise<{ origin?: string }>;
}

// VISA_FACILITATOR's "My Schedule" (DR-031) -- whole-org queue, no country
// scoping concept exists for this role. Now also reachable by TOUR_OPERATOR
// (DR-034: "the Tour Operator is by default also a Visa Facilitator role").
// Mostly read-only -- decide/resubmit/upload stay API-only (this page is the
// discovery/overview surface the spec calls "immigration tasks / missing
// documents / visa deadlines", not a new decision-making UI) -- except the
// two DR-034 actions (contact traveller / request missing documents) and,
// since DR-060, starting an application from the "Needs application"
// section below. (IMMIGRATION_OFFICER and its own separate country-scoped
// /staff/immigration page were removed entirely in DR-032.)
export default async function VisaQueuePage({ searchParams }: Props) {
  const ctx = await requireStaffContext('visa.process');
  const { origin } = await searchParams;
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
        <PageHeader eyebrow="My schedule" title="Visa queue" />
        <div className="flex flex-wrap gap-6 text-sm text-mist">
          <p>
            <span className="font-semibold text-navy">{pendingCount}</span> immigration task{pendingCount === 1 ? '' : 's'} awaiting decision
          </p>
          <p>
            <span className="font-semibold text-navy">{missingDocCount}</span> missing document{missingDocCount === 1 ? '' : 's'}
          </p>
          <p>
            <span className="font-semibold text-navy">{needingApplication.length}</span> traveler{needingApplication.length === 1 ? '' : 's'} needing an application started
          </p>
        </div>

        {needingApplication.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-navy">Needs application</h2>
            <p className="mb-3 text-xs text-mist">
              These travelers have an uploaded passport on a booking that requires visa assistance, but no application
              exists yet -- normally this is automatic on passport upload, so this list should stay empty; it&apos;s a
              safety net for anything that predates or slipped past that.
            </p>
            <Table>
              <thead>
                <TableHeaderRow>
                  <Th>Traveler</Th>
                  <Th>Nationality</Th>
                  <Th>Source</Th>
                  <Th>Passport</Th>
                  <Th>Actions</Th>
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
                        View
                      </a>
                    </Td>
                    <Td>
                      <form action={startApplicationAction.bind(null, n.bookingId, n.travelerId)}>
                        <SubmitButton size="compact" pendingLabel="Starting…">
                          Start application
                        </SubmitButton>
                      </form>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          <Link
            href={pillHref(undefined)}
            className={`rounded-survey border border-rule px-3 py-1 ${!origin ? 'bg-navy text-bone' : 'text-ink'}`}
          >
            All ({allApplications.length})
          </Link>
          {(['PREDEFINED_PACKAGE', 'TAILOR_MADE'] satisfies BookingOrigin[]).map((o) => {
            const count = allApplications.filter((a) => a.origin === o).length;
            if (count === 0) return null;
            return (
              <Link
                key={o}
                href={pillHref(o)}
                className={`rounded-survey border border-rule px-3 py-1 ${origin === o ? 'bg-navy text-bone' : 'text-ink'}`}
              >
                {ORIGIN_LABEL[o]} ({count})
              </Link>
            );
          })}
        </div>

        {applications.length === 0 ? (
          <p className="text-mist">No visa applications match that filter.</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>Traveler</Th>
                <Th>Reference</Th>
                <Th>Nationality</Th>
                <Th>Source</Th>
                <Th>Country</Th>
                <Th>Status</Th>
                <Th>Travel date</Th>
                <Th>Document</Th>
                <Th>Passport</Th>
                <Th>Rejection reason</Th>
                <Th>Actions</Th>
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
                    {a.country}
                    <div className="mt-1 text-xs">
                      {regulation?.processingTimeDays != null && (
                        <span className="text-mist">{regulation.processingTimeDays}d processing · </span>
                      )}
                      <Link href={`/staff/country-regulations/${a.country}`} className="text-forest hover:underline">
                        {regulation ? 'View requirements' : 'Add requirements'}
                      </Link>
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={VISA_STATUS_TONE[a.status]}>{a.status}</Badge>
                  </Td>
                  <Td>
                    {a.travelStartDate ? (
                      <>
                        {a.travelStartDate.toLocaleDateString()}{' '}
                        <span className="text-xs text-mist">({daysUntil(a.travelStartDate, now)}d)</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </Td>
                  <Td>
                    {a.hasDocument ? 'Yes' : <Badge tone="warning">Missing</Badge>}
                  </Td>
                  <Td>
                    {a.bookingId && a.hasPassport ? (
                      <a
                        href={`/api/v1/bookings/${a.bookingId}/travelers/${a.travelerId}/passport`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-forest hover:underline"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-xs text-mist">Not uploaded</span>
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
                            placeholder="Message…"
                            className="w-40 rounded-survey border border-rule px-2 py-1 text-xs"
                          />
                          <SubmitButton size="compact" pendingLabel="Sending…">
                            Contact
                          </SubmitButton>
                        </form>
                        {!a.hasDocument && (
                          <form action={requestMissingDocumentsAction.bind(null, a.bookingId, a.travelerId)}>
                            <SubmitButton size="compact" variant="secondary" pendingLabel="Sending…">
                              Request documents
                            </SubmitButton>
                          </form>
                        )}
                      </div>
                    )}
                  </Td>
                </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </div>
    </div>
  );
}
