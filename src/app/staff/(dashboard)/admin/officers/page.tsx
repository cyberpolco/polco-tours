import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { Alert } from '@/components/ui/Alert';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { assignOfficerCountryAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string }>;
}

// Admin-only (admin.all): assigns/reassigns an IMMIGRATION_OFFICER's country
// scope (BR-10, DR-019's authService.assignOfficerCountry -- API-only until
// this page, DR-020). Creating a brand-new officer account stays CLI-only
// (scripts/create-staff-user.ts) -- out of scope, same as DR-014's "staff
// can only book for an already-registered tourist" precedent.
export default async function OfficersPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('admin.all');
  const { error } = await searchParams;
  const { officers, availableCountries } = await authService.listOfficers(ctx);

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader eyebrow="Admin" title="Immigration officers" />
      {error === 'invalid_country' && <Alert tone="error">Choose one of this organization&apos;s countries.</Alert>}
      {officers.length === 0 ? (
        <p className="text-mist">
          No immigration officer accounts yet. Create one via scripts/create-staff-user.ts, then assign it a
          country here.
        </p>
      ) : (
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Assigned country</Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {officers.map((o) => (
              <Tr key={o.id}>
                <Td>{o.name ?? '—'}</Td>
                <Td>{o.email}</Td>
                <Td>{o.assignedCountry ?? '— unassigned —'}</Td>
                <Td>
                  <form action={assignOfficerCountryAction.bind(null, o.id)} className="flex items-center gap-2">
                    <select
                      name="country"
                      defaultValue={o.assignedCountry ?? ''}
                      className="rounded-survey border border-rule px-2 py-1 text-xs"
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {availableCountries.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="secondary" size="compact">
                      Assign
                    </SubmitButton>
                  </form>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
