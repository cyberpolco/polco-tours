import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { ALL_PERMISSIONS, EDITABLE_ROLES } from '@lib/rbac';
import { authService } from '@modules/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { PermissionCheckbox } from './permission-checkbox';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';

// SUPERADMIN-only (DR-035) -- "Super Admin can: ... Manage permissions."
// PLATFORM_ADMIN passes the route's admin.all gate but is redirected here
// (and would be rejected by authService.getPermissionMatrix regardless):
// this is the one staff page where even the usual "Tour operator/Platform
// Admin = admin-equivalent" precedent doesn't apply, since editing the
// matrix that decides everyone else's access -- including PLATFORM_ADMIN's
// own -- is exactly what the spec reserves for the one role that can never
// be locked out.
export default async function PermissionsPage() {
  const ctx = await requireStaffContext('admin.all');
  if (!ctx.roles.includes('SUPERADMIN')) redirect('/staff/forbidden');

  const matrix = await authService.getPermissionMatrix(ctx);

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Permission matrix" />
      <p className="max-w-2xl text-sm text-mist">
        Toggles take effect immediately. SUPERADMIN itself never appears here -- it&apos;s a fixed, permanent role
        that can never be edited or locked out of the system.
      </p>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <TableHeaderRow>
              <Th>Permission</Th>
              {EDITABLE_ROLES.map((role) => (
                <Th key={role}>{role}</Th>
              ))}
            </TableHeaderRow>
          </thead>
          <tbody>
            {ALL_PERMISSIONS.map((permission) => (
              <Tr key={permission}>
                <Td className="whitespace-nowrap font-mono text-xs">{permission}</Td>
                {EDITABLE_ROLES.map((role) => (
                  <Td key={role}>
                    <PermissionCheckbox role={role} permission={permission} checked={matrix[role].includes(permission)} />
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
    </SidebarShell>
  );
}
