import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';

// Directory of every bare/anonymous TOURIST contact record in the org --
// none of these can ever sign in (createBareTourist creates no Account/
// credential row; a guest's own anonymous session has no password either),
// so this is read-only, unlike the Users page's role/password management.
// SUPERADMIN/TOUR_OPERATOR-only (explicit user choice) -- the roles that
// actually create/interact with these records via /staff/bookings/new.
export default async function ClientsPage() {
  const ctx = await requireStaffContext('booking.create');
  if (!ctx.roles.includes('SUPERADMIN') && !ctx.roles.includes('TOUR_OPERATOR')) redirect('/staff/forbidden');

  const clients = await authService.listClients(ctx);

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <PageHeader eyebrow="Settings" title="Clients" />
        <p className="text-sm text-mist">
          Every client contact record on file -- from a guest browsing packages, a `/plan-my-trip` request, or a
          booking created manually here. None of these are staff/login accounts; the email/phone exist only for
          booking notifications.
        </p>
        {clients.length === 0 ? (
          <p className="text-mist">No clients yet.</p>
        ) : (
          <Table>
            <thead>
              <TableHeaderRow>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
              </TableHeaderRow>
            </thead>
            <tbody>
              {clients.map((c) => (
                <Tr key={c.id}>
                  <Td>{c.name ?? '—'}</Td>
                  <Td>{c.email}</Td>
                  <Td>{c.phone ?? '—'}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </SidebarShell>
  );
}
