import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { Alert } from '@/components/ui/Alert';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { deleteClientAction } from './actions';

interface Props {
  searchParams: Promise<{ error?: string; detail?: string }>;
}

// Directory of every bare/anonymous TOURIST contact record in the org --
// none of these can ever sign in (createBareTourist creates no Account/
// credential row; a guest's own anonymous session has no password either).
// SUPERADMIN/TOUR_OPERATOR can both view (explicit user choice, the roles
// that actually create/interact with these records via /staff/bookings/new);
// only SUPERADMIN can delete one, and only once every one of the client's
// non-deleted bookings is COMPLETED and reviewed (or already deleted by a
// superadmin) -- see src/lib/client-deletion.ts for the actual guard.
export default async function ClientsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.create');
  if (!ctx.roles.includes('SUPERADMIN') && !ctx.roles.includes('TOUR_OPERATOR')) redirect('/staff/forbidden');
  const { detail } = await searchParams;

  const clients = await authService.listClients(ctx);
  const canDelete = ctx.roles.includes('SUPERADMIN');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <PageHeader eyebrow="Settings" title="Clients" />
        <p className="text-sm text-mist">
          Every client contact record on file -- from a guest browsing packages, a `/plan-my-trip` request, or a
          booking created manually here. None of these are staff/login accounts; the email/phone exist only for
          booking notifications.
        </p>
        {detail && (
          <Alert tone="error">
            Could not delete this client: {detail}
          </Alert>
        )}
        {clients.length === 0 ? (
          <p className="text-mist">No clients yet.</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                {canDelete && <Th />}
              </TableHeaderRow>
            </thead>
            <tbody>
              {clients.map((c) => (
                <Tr key={c.id}>
                  <Td>{c.name ?? '—'}</Td>
                  <Td>{c.email}</Td>
                  <Td>{c.phone ?? '—'}</Td>
                  {canDelete && (
                    <Td>
                      <form action={deleteClientAction.bind(null, c.id)}>
                        <SubmitButton
                          variant="secondary"
                          size="compact"
                          pendingLabel="Deleting…"
                          confirmMessage={`Delete ${c.name ?? c.email}? This cannot be undone.`}
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    </Td>
                  )}
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </SidebarShell>
  );
}
