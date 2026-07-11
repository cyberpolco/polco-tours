import { requireStaffContext } from '@lib/staff-guard';
import { visaService } from '@modules/visa';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { VISA_STATUS_TONE } from '@lib/status-tones';

interface Props {
  searchParams: Promise<{ country?: string }>;
}

// Strictly read-only (BR-10) -- no decide/approve/reject action anywhere on
// this page, even for an admin viewing it. That workflow belongs to
// VISA_FACILITATOR (visa.process, via the booking-nested visa routes), a
// separate role this increment doesn't touch. IMMIGRATION_OFFICER is forced
// to their own assignedCountry inside visaService.listForCountry; an
// admin may pass ?country= to filter or see every country.
export default async function ImmigrationPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('immigration.read');
  const { country } = await searchParams;
  const applications = await visaService.listForCountry(ctx, country);

  const title =
    ctx.role === 'IMMIGRATION_OFFICER'
      ? `Visa queue — ${ctx.assignedCountry}`
      : country
        ? `Visa queue — ${country}`
        : 'Visa queue — all countries';

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Immigration" title={title} />
      {applications.length === 0 ? (
        <p className="text-mist">No visa applications to show.</p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Traveler</Th>
              <Th>Nationality</Th>
              <Th>ID / passport #</Th>
              <Th>Country</Th>
              <Th>Status</Th>
              <Th>Submitted</Th>
              <Th>Decided</Th>
              <Th>Document</Th>
            </TableHeaderRow>
          </thead>
          <tbody>
            {applications.map((a) => (
              <Tr key={a.id}>
                <Td>
                  {a.travelerFirstName} {a.travelerLastName}
                </Td>
                <Td>{a.travelerNationality}</Td>
                <Td>{a.travelerIdOrPassportNumber}</Td>
                <Td>{a.country}</Td>
                <Td>
                  <Badge tone={VISA_STATUS_TONE[a.status]}>{a.status}</Badge>
                </Td>
                <Td>{a.submittedAt.toLocaleDateString()}</Td>
                <Td>{a.decidedAt ? a.decidedAt.toLocaleDateString() : '—'}</Td>
                <Td>{a.hasDocument ? 'Yes' : 'No'}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
