import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { ALL_PERMISSIONS, EDITABLE_ROLES } from '@lib/rbac';
import { authService } from '@modules/auth';
import { PageHeader } from '@/components/ui/PageHeader';
import { PermissionMatrixForm } from './permission-matrix-form';
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
  const t = await getTranslations('StaffPermissions');
  const tSidebar = await getTranslations('StaffSettingsSidebar');

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <p className="max-w-2xl text-sm text-mist">{t('intro')}</p>
        <PermissionMatrixForm matrix={matrix} roles={EDITABLE_ROLES} permissions={ALL_PERMISSIONS} />
      </div>
    </SidebarShell>
  );
}
