import { requireStaffContext } from '@lib/staff-guard';
import { ASSIGNABLE_ROLES, authService } from '@modules/auth';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { CreateUserForm } from './create-user-form';
import { deactivateUserAction } from './actions';

// Admin-only (admin.all): general user management (DR-026), separate from
// /staff/admin/officers (narrowly about IMMIGRATION_OFFICER country
// assignment) -- replaces CLI-only staff account creation
// (scripts/create-staff-user.ts) with a real in-app flow.
export default async function UsersPage() {
  const ctx = await requireStaffContext('admin.all');
  const users = await authService.listUsers(ctx);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Admin" title="Users" />

      <Table>
        <thead>
          <TableHeaderRow>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
            <Th>Roles</Th>
            <Th>Status</Th>
            <Th />
          </TableHeaderRow>
        </thead>
        <tbody>
          {users.map((u) => (
            <Tr key={u.id}>
              <Td>{u.name ?? '—'}</Td>
              <Td>{u.email}</Td>
              <Td>{u.phone ?? '—'}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {u.roles.map((r) => (
                    <Badge key={r} tone="neutral">
                      {r}
                    </Badge>
                  ))}
                </div>
              </Td>
              <Td>
                <Badge tone={u.deletedAt ? 'danger' : 'success'}>{u.deletedAt ? 'Deactivated' : 'Active'}</Badge>
              </Td>
              <Td>
                {u.id !== ctx.userId && !u.deletedAt && (
                  <form action={deactivateUserAction.bind(null, u.id)}>
                    <SubmitButton variant="secondary" size="compact">
                      Deactivate
                    </SubmitButton>
                  </form>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-navy">Create a new user</h2>
        <CreateUserForm assignableRoles={ASSIGNABLE_ROLES} />
      </div>
    </div>
  );
}
