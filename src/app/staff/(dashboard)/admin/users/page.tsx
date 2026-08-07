import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { ASSIGNABLE_ROLES, authService } from '@modules/auth';
import { Badge } from '@/components/ui/Badge';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { CreateUserForm } from './create-user-form';
import { deactivateUserAction, reactivateUserAction } from './actions';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';

// Admin-only (admin.all): general user management (DR-026) -- replaces
// CLI-only staff account creation (scripts/create-staff-user.ts) with a
// real in-app flow.
export default async function UsersPage() {
  const ctx = await requireStaffContext('admin.all');
  const users = await authService.listUsers(ctx);

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
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
            <Th>Last login</Th>
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
                {/* DR-084: Inactive (30+ days no sign-in, auto-flagged) is a
                    third state alongside the existing manual Active/
                    Deactivated -- Deactivated always wins when both are
                    true, since that user can't sign in regardless of
                    dormancy. */}
                <Badge tone={u.deletedAt ? 'danger' : u.inactiveAt ? 'warning' : 'success'}>
                  {u.deletedAt ? 'Deactivated' : u.inactiveAt ? 'Inactive' : 'Active'}
                </Badge>
              </Td>
              <Td>{u.lastLoginAt ? u.lastLoginAt.toLocaleString() : 'Never'}</Td>
              <Td>
                <div className="flex items-center gap-3">
                  {u.id !== ctx.userId && (
                    <Link href={`/staff/admin/users/${u.id}`} className="text-forest hover:underline">
                      Edit
                    </Link>
                  )}
                  {u.id !== ctx.userId && !u.deletedAt && !u.inactiveAt && (
                    <form action={deactivateUserAction.bind(null, u.id)}>
                      <SubmitButton
                        variant="secondary"
                        size="compact"
                        confirmMessage={`Deactivate ${u.name ?? u.email}? They will no longer be able to sign in.`}
                      >
                        Deactivate
                      </SubmitButton>
                    </form>
                  )}
                  {!u.deletedAt && u.inactiveAt && (
                    <form action={reactivateUserAction.bind(null, u.id)}>
                      <SubmitButton variant="success" size="compact">
                        Reactivate
                      </SubmitButton>
                    </form>
                  )}
                </div>
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
    </SidebarShell>
  );
}
