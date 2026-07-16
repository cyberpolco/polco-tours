import { requireStaffContext } from '@lib/staff-guard';
import { visaService } from '@modules/visa';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { VISA_STATUS_TONE } from '@lib/status-tones';

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY);
}

// VISA_FACILITATOR's "My Schedule" (DR-031) -- whole-org queue, no country
// scoping concept exists for this role. Read-only -- decide/resubmit/upload
// stay API-only for now (this page is the discovery/overview surface the
// spec calls "immigration tasks / missing documents / visa deadlines", not a
// new decision-making UI). (IMMIGRATION_OFFICER and its own separate
// country-scoped /staff/immigration page were removed entirely in DR-032.)
export default async function VisaQueuePage() {
  const ctx = await requireStaffContext('visa.process');
  const applications = await visaService.listForFacilitator(ctx);
  const now = new Date();

  const pendingCount = applications.filter((a) => a.status === 'SUBMITTED').length;
  const missingDocCount = applications.filter((a) => !a.hasDocument).length;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="My schedule" title="Visa queue" />
      <div className="flex gap-6 text-sm text-mist">
        <p>
          <span className="font-semibold text-navy">{pendingCount}</span> immigration task{pendingCount === 1 ? '' : 's'} awaiting decision
        </p>
        <p>
          <span className="font-semibold text-navy">{missingDocCount}</span> missing document{missingDocCount === 1 ? '' : 's'}
        </p>
      </div>

      {applications.length === 0 ? (
        <p className="text-mist">No visa applications to show.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Traveler</Th>
              <Th>Nationality</Th>
              <Th>Country</Th>
              <Th>Status</Th>
              <Th>Travel date</Th>
              <Th>Document</Th>
              <Th>Rejection reason</Th>
            </TableHeaderRow>
          </thead>
          <tbody>
            {applications.map((a) => (
              <Tr key={a.id}>
                <Td>
                  {a.travelerFirstName} {a.travelerLastName}
                </Td>
                <Td>{a.travelerNationality}</Td>
                <Td>{a.country}</Td>
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
                <Td>{a.rejectionReason ?? '—'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
